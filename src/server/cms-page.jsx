/**
 * @file `createCmsPage` factory, server-only, published under `inscribed/page`.
 * One factory call (typically `app/lib/cms.jsx`) holds your config, session
 * strategy, and revalidation; then every page reduces to:
 *
 *   import { CmsPage } from "../lib/cms.jsx";
 *   import { EditableRegion } from "inscribed";
 *
 *   export default function Page() {
 *     return (
 *       <CmsPage slug="/foo">
 *         <main>
 *           <EditableRegion blockPath="hero.title" as="h1" />
 *         </main>
 *       </CmsPage>
 *     );
 *   }
 *
 * `slug` is optional. When omitted, the helper reads the active pathname from
 * the `x-pathname` header so you can wrap the root layout once and let static
 * pages inherit it. That header isn't standard; populate it via middleware:
 *
 *   // middleware.js
 *   import { NextResponse } from "next/server";
 *   export function middleware(req) {
 *     const headers = new Headers(req.headers);
 *     headers.set("x-pathname", req.nextUrl.pathname);
 *     return NextResponse.next({ request: { headers } });
 *   }
 *
 * Dynamic routes (`/news/[id]`) still need an explicit `slug` because the
 * header carries the concrete path, not the manifest template.
 *
 * `Provider` is passed in rather than imported so its `"use client"` boundary
 * survives bundling (tsup doesn't preserve the directive across entries).
 */

import { Suspense } from "react";
import { headers } from "next/headers";

import { getCmsCollection, getCmsCollectionItem, getCmsPageBlocks } from "./get-content.js";
import { createCmsConfig } from "../lib/config.js";
import { publicAuth } from "../defaults/auth.js";

// Re-exported here (not from the client entry) because pages calling it are
// Server Components; the index bundle's "use client" would turn the export
// into a client reference that can't be called during server render.
export { withCms } from "../lib/with-cms.js";
// Same reason: config factories run in server modules (app/lib/cms.jsx), so
// the callable export must come from this server entry. The index export
// remains for client-side wrappers.
export { createCmsConfig } from "../lib/config.js";

const PATHNAME_HEADER = "x-pathname";

/**
 * @import { CmsConfig } from "../lib/config.js"
 */

/**
 * @typedef {Object} CreateCmsPageOptions
 * @property {CmsConfig | { baseUrl: string }} config
 * @property {import("../lib/service-token.js").ServiceTokenProvider} [getServiceToken]
 *   Server-only provider for the service token on the SSR content fetch, so
 *   public visitors get rendered content without a session. Never passed to
 *   the client `Provider`. Default: no token, which reaches `/cms/content`
 *   only through the public endpoint (`clientKey` + the client's anonymous-read
 *   flag); otherwise inject e.g. a `render`-preset service key.
 * @property {import("../lib/transport.js").CmsTransport} [transport]
 *   Custom transport for the SSR fetch. Server-only, so to use it client-side
 *   too pass it to your provider as well. Default: REST against `config.baseUrl`.
 * @property {*} Provider
 *   The CMS provider component, typically `CmsProvider` or your own wrapper
 *   around it. Receives `config`, `isAdmin`, `userSub`, `initialBlocks`,
 *   `onAfterSave`, and `session`.
 *
 * The three auth callbacks below form a `CmsAuthAdapter` (see `lib/auth.js`);
 * omit them all for a public read-only site, or spread an adapter from an
 * auth plugin / your own code.
 *
 * @property {import("../lib/auth.js").GetSession} [getSession]
 *   Resolves the server session. Default: `publicAuth.getSession` (always null → public).
 * @property {(session: *) => boolean} [deriveAdmin]
 *   Decides admin from the session. Default: `session != null`.
 * @property {(session: *) => string | null} [deriveUserSub]
 *   Default: `session?.user?.id ?? null`.
 * @property {CollectionPrimitives} [collections]
 *   Opt in to the server-rendered `<CollectionRegion>` / `<CollectionItem>`,
 *   which the factory then returns alongside `CmsPage`. Pass
 *   `{ CollectionRecord, CollectionRows }` imported from
 *   `inscribed/collections`; omit it and an app that doesn't use collections
 *   pulls none of that in.
 * @property {(key: string, slug?: string) => void | Promise<void>} [onAfterCollectionSave]
 *   Server Action run after a collection record is published, typically
 *   `revalidateCmsCollection` from `inscribed/actions`. Needed whenever
 *   collections render on the server, or a publish leaves the ISR cache stale.
 * @property {(slug: string) => void | Promise<void>} [onAfterSave]
 *   Server Action run after a successful admin save, typically
 *   `revalidateCmsSlug` from `inscribed/actions`. Import it consumer-side and
 *   pass it explicitly; importing it here would strip its "use server" status
 *   during bundling.
 */

/**
 * The client components the server-rendered binding components render into.
 * Import both from `inscribed/collections` and pass them here.
 *
 * They are options rather than imports because only a module's own exports
 * become client references across the RSC boundary: reached from this server
 * entry's graph they would lose their `"use client"` boundary, and wrapped in an
 * object built here they would arrive `undefined`.
 *
 * @typedef {Object} CollectionPrimitives
 * @property {*} CollectionRecord
 * @property {*} CollectionRows
 */

/**
 * @param {CreateCmsPageOptions} options
 * @returns {{
 *   CmsPage: (props: { slug?: string, children: React.ReactNode }) => Promise<React.ReactElement>,
 *   CollectionRegion?: *,
 *   CollectionItem?: *,
 * }}
 */
export function createCmsPage(options) {
  const {
    Provider,
    config,
    getServiceToken,
    transport,
    getSession = publicAuth.getSession,
    deriveAdmin = publicAuth.deriveAdmin,
    deriveUserSub = publicAuth.deriveUserSub,
    onAfterSave,
    onAfterCollectionSave,
    collections,
  } = options;

  if (!Provider) {
    throw new Error("createCmsPage: `Provider` option is required");
  }
  if (!config) {
    throw new Error("createCmsPage: `config` option is required");
  }

  // Normalize once at build time. A plain `{ baseUrl }` literal would miss
  // defaulted fields (notably `globalSlug`), making the server skip the
  // __global fetch so public visitors see header/footer placeholders.
  const normalizedConfig = "baseUrl" in config && Object.isFrozen(config)
    ? /** @type {import("../lib/config.js").CmsConfig} */ (config)
    : createCmsConfig(config);

  // Server-only view: the service token (secrets) and transport (functions)
  // must never reach the client, so they ride on a separate object used only
  // for the SSR fetch. The `normalizedConfig` sent to <Provider> stays serializable.
  const serverConfig =
    getServiceToken || transport
      ? {
          ...normalizedConfig,
          ...(getServiceToken ? { getServiceToken } : {}),
          ...(transport ? { transport } : {}),
        }
      : normalizedConfig;

  async function CmsPage({ slug, children }) {
    const resolvedSlug = slug ?? (await resolveSlugFromHeaders());
    const session = await getSession();

    let initialBlocks = [];
    try {
      initialBlocks = await getCmsPageBlocks(serverConfig, resolvedSlug);
    } catch (err) {
      // Backend offline or page not yet synced: render with empty blocks.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[inscribed] SSR content fetch failed for "${resolvedSlug}":`, err);
      }
    }

    return (
      <Provider config={normalizedConfig} isAdmin={deriveAdmin(session)} userSub={deriveUserSub(session)}
        initialBlocks={initialBlocks} onAfterSave={onAfterSave}
        onAfterCollectionSave={onAfterCollectionSave} session={session}
      >
        {children}
      </Provider>
    );
  }

  if (!collections) return { CmsPage };
  return { CmsPage, ...createServerCollections(serverConfig, collections) };
}

/**
 * The server-rendered binding components. Each is a synchronous shell returning
 * a `<Suspense>` around an async inner component, which is what lets a slow
 * collection stream in *after* the page shell has already been flushed: the
 * consumer writes no boundary of their own, and a collection reading external
 * data can never hold the document back.
 *
 * @param {import("../lib/config.js").CmsConfig} serverConfig
 * @param {CollectionPrimitives} primitives
 */
function createServerCollections(serverConfig, { CollectionRecord, CollectionRows }) {
  async function RegionRows({ collection, filter, limit, offset, as, empty, children, rest }) {
    /** @type {import("../lib/schemas.js").CollectionListParams | undefined} */
    const params = filter || typeof limit === "number" || typeof offset === "number"
      ? {
          ...(filter ? { filter } : {}),
          ...(typeof limit === "number" ? { limit } : {}),
          ...(typeof offset === "number" ? { offset } : {}),
        }
      : undefined;

    let items = [];
    try {
      ({ items } = await getCmsCollection(serverConfig, collection, params));
    } catch (err) {
      // Same posture as the block fetch: a page whose collection is unreachable
      // still renders, with the region's own empty branch.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[inscribed] SSR collection fetch failed for "${collection}":`, err);
      }
    }

    // `CollectionRows` registers the window with the drawer itself: that needs
    // hooks, and it is already the client boundary here.
    return (
      <CollectionRows
        collection={collection} items={items} filter={filter} limit={limit} offset={offset}
        as={as} empty={empty} {...rest}
      >
        {children}
      </CollectionRows>
    );
  }

  /** @param {Record<string, *>} props */
  function CollectionRegion({ collection, filter, limit, offset, as, fallback, empty, children, ...rest }) {
    return (
      <Suspense fallback={fallback ?? null}>
        <RegionRows
          collection={collection} filter={filter} limit={limit} offset={offset}
          as={as} empty={empty} rest={rest}
        >
          {children}
        </RegionRows>
      </Suspense>
    );
  }

  async function RecordBody({ collection, slug, group, label, missing, error: errorNode, children }) {
    let item = null;
    try {
      item = await getCmsCollectionItem(serverConfig, collection, slug);
    } catch (err) {
      if (/** @type {*} */ (err)?.isNotFound) return missing ?? null;
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[inscribed] SSR collection item fetch failed for "${collection}/${slug}":`, err);
      }
      return errorNode ?? missing ?? null;
    }
    if (!item) return missing ?? null;

    return (
      <CollectionRecord collection={collection} slug={slug} item={item} group={group} label={label}>
        {children}
      </CollectionRecord>
    );
  }

  /** @param {Record<string, *>} props */
  function CollectionItem({ collection, slug, group, label, fallback, missing, error: errorNode, children }) {
    return (
      <Suspense fallback={fallback ?? null}>
        <RecordBody
          collection={collection} slug={slug} group={group} label={label}
          missing={missing} error={errorNode}
        >
          {children}
        </RecordBody>
      </Suspense>
    );
  }

  return { CollectionRegion, CollectionItem };
}

/**
 * Read the pathname from the `x-pathname` header set by consumer middleware.
 * `await` covers both Next 14 (sync `headers()`) and Next 15 (async). Warns
 * in dev when the header is missing, falls back to `/` silently in prod.
 *
 * @returns {Promise<string>}
 */
async function resolveSlugFromHeaders() {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER);
  if (pathname) return pathname;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] <CmsPage> rendered without a slug prop and no "${PATHNAME_HEADER}" ` +
        "request header was found. Add middleware that copies the pathname into the " +
        "request headers, or pass slug={...} explicitly. Falling back to \"/\".",
    );
  }
  return "/";
}