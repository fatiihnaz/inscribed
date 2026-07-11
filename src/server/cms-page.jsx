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

import { headers } from "next/headers";

import { getCmsPageBlocks } from "./get-content.js";
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
 *   the client `Provider`. Default: no token; the reference backend requires
 *   `cms:access` on `/cms/content`, so inject e.g. a service-key provider.
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
 * @property {(slug: string) => void | Promise<void>} [onAfterSave]
 *   Server Action run after a successful admin save, typically
 *   `revalidateCmsSlug` from `inscribed/actions`. Import it consumer-side and
 *   pass it explicitly; importing it here would strip its "use server" status
 *   during bundling.
 */

/**
 * @param {CreateCmsPageOptions} options
 * @returns {(props: { slug?: string, children: React.ReactNode }) => Promise<React.ReactElement>}
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

  return async function CmsPage({ slug, children }) {
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
        initialBlocks={initialBlocks} onAfterSave={onAfterSave} session={session}
      >
        {children}
      </Provider>
    );
  };
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