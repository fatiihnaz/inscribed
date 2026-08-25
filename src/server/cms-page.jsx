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
 * On a multilingual site the same applies to `locale`: it too is read from the
 * header by default, so an `app/[locale]/…` route that wants to prerender
 * should pass its own segment through and skip the header entirely:
 *
 *   export default async function Page({ params }) {
 *     const { locale } = await params;
 *     return <CmsPage slug="/about" locale={locale}>…</CmsPage>;
 *   }
 *
 * `Provider` is passed in rather than imported so its `"use client"` boundary
 * survives bundling (tsup doesn't preserve the directive across entries).
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import { getCmsCollection, getCmsCollectionItem, getCmsPageBlocks } from "./get-content.js";
import { ensureCmsConfig } from "../shared/config.js";
import { normalizePanels } from "../shared/panels.js";
import { localizePath, resolveCmsRoute } from "../shared/route.js";
import { buildListParams } from "../collections/params.js";
import { publicAuth } from "../defaults/auth.js";
import { handleSsrFailure } from "./ssr-failure.js";

// Re-exported here (not from the client entry) because config factories run in
// server modules (app/lib/cms.jsx), and the index bundle's "use client" would
// turn the export into a client reference that can't be called during server
// render. The index export remains for client-side wrappers.
export { createCmsConfig } from "../shared/config.js";

const PATHNAME_HEADER = "x-pathname";

/**
 * @import { CmsConfig } from "../shared/config.js"
 */

/**
 * @typedef {Object} CreateCmsPageOptions
 * @property {CmsConfig | { baseUrl: string }} config
 * @property {import("../shared/contracts/service-token.js").ServiceTokenProvider} [getServiceToken]
 *   Server-only provider for the service token on the SSR content fetch, so
 *   public visitors get rendered content without a session. Never passed to
 *   the client `Provider`. Default: no token, which reaches `/cms/content`
 *   only through the public endpoint (`clientKey` + the client's anonymous-read
 *   flag); otherwise inject e.g. a `render`-preset service key.
 * @property {import("../shared/contracts/transport.js").CmsTransport} [transport]
 *   Custom transport for the SSR fetch. Server-only, so to use it client-side
 *   too pass it to your provider as well. Default: REST against `config.baseUrl`.
 * @property {*} Provider
 *   The CMS provider component, typically `CmsProvider` or your own wrapper
 *   around it. Receives `config`, `isAdmin`, `userSub`, `initialBlocks`,
 *   `initialRoute`, `onAfterSave`, `session`, and (when `collections` is given)
 *   `collections`. A wrapper must forward all of them; spreading `{...props}`
 *   is what does that.
 *
 * The three auth callbacks below form a `CmsAuthAdapter` (see `shared/contracts/auth.js`);
 * omit them all for a public read-only site, or spread an adapter from an
 * auth plugin / your own code.
 *
 * @property {import("../shared/contracts/auth.js").GetSession} [getSession]
 *   Resolves the server session. Default: `publicAuth.getSession` (always null → public).
 *   Its result stays on the server unless `sessionForClient` says otherwise.
 * @property {(session: *) => boolean} [deriveAdmin]
 *   Decides admin from the session. Default: `session != null`.
 * @property {(session: *) => string | null} [deriveUserSub]
 *   Default: `session?.user?.id ?? null`.
 * @property {(session: *) => *} [sessionForClient]
 *   What of the session, if anything, to forward to `Provider` as `session`.
 *   Omitted by default, and that default is the point: `Provider` is a client
 *   component, so every prop it takes is serialized into the RSC payload and
 *   shipped to the browser. A session commonly carries an access token, a
 *   refresh token or internal claims, none of which the CMS reads. Wrappers that
 *   need one (feeding NextAuth's `<SessionProvider>`, say) opt in here and pick
 *   the fields that may travel: `sessionForClient: (s) => ({ user: s.user })`.
 * @property {CollectionPrimitives} [collections]
 *   Opt in to collections, on both sides at once: the factory returns the
 *   server-rendered `<CollectionRegion>` / `<CollectionItem>` alongside
 *   `CmsPage`, and hands `CollectionProvider` to `Provider` so the client state
 *   exists too. Pass `{ CollectionProvider, CollectionRecord, CollectionRows }`
 *   imported from `inscribed/collections`; omit it and an app that doesn't use
 *   collections pulls none of that in.
 * @property {import("../shared/panels.js").CmsPanel[]} [panels]
 *   Admin areas of your own, added to the drawer's rail beside Page and
 *   Collections: `{ id, label | labelKey, Component, icon?, accent? }`. The body
 *   is your JSX and reads the CMS through `useCmsPanel()` from
 *   `inscribed/panels`; nothing else about it is ours.
 *
 *   `Component` and `icon` must come from your own `"use client"` module, for
 *   the same reason the `collections` bag is assembled by you rather than here.
 * @property {(key: string, slug?: string) => void | Promise<void>} [onAfterCollectionSave]
 *   Server Action run after a collection record is published, typically
 *   `revalidateCmsCollection` from `inscribed/actions`. Needed whenever
 *   collections render on the server, or a publish leaves the ISR cache stale.
 * @property {(slug: string) => void | Promise<void>} [onAfterSave]
 *   Server Action run after a successful admin save, typically
 *   `revalidateCmsSlug` from `inscribed/actions`. Import it consumer-side and
 *   pass it explicitly; importing it here would strip its "use server" status
 *   during bundling.
 * @property {import("./ssr-failure.js").SsrErrorReporter} [onSsrError]
 *   Called when an SSR content fetch fails against a reachable-but-broken or
 *   unreachable backend: `(err, { kind, target, locale })`, where `kind` is
 *   `"page" | "global" | "collection"`. Wire it to your error reporter.
 *
 *   Default: nothing. The SDK logs a failed fetch in development only, and an
 *   outage in production is otherwise silent, which is exactly the case this
 *   seam exists for. Not called for a 404 (absent content is not a failure).
 *   A throw from the reporter is swallowed.
 */

/**
 * The client half of the collections capability. Import all three from
 * `inscribed/collections` and pass them here.
 *
 * They are options rather than imports because only a module's own exports
 * become client references across the RSC boundary: reached from this server
 * entry's graph they would lose their `"use client"` boundary, and wrapped in an
 * object built here they would arrive `undefined`.
 *
 * @typedef {Object} CollectionPrimitives
 * @property {*} CollectionProvider
 *   Forwarded to `Provider` as its `collections` prop, which is what mounts the
 *   collection state for the page bindings and the drawer alike. It travels in
 *   this bag so opting in stays one decision: a client provider without the
 *   server components (or the reverse) is a half-wired app.
 * @property {*} CollectionRecord
 * @property {*} CollectionRows
 */

/**
 * @param {CreateCmsPageOptions} options
 * @returns {{
 *   CmsPage: (props: { slug?: string, locale?: string, children: React.ReactNode }) => Promise<React.ReactElement>,
 *   localePath: (slug: string, locale?: string) => string,
 *   getCmsRoute: () => Promise<import("../shared/route.js").CmsRoute>,
 *   resolveCollectionItem: (key: string, slug: string, options?: import("./get-content.js").GetCmsContentOptions & { path?: (slug: string) => string }) => Promise<import("../shared/contracts/schemas.js").CollectionItemResponse>,
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
    sessionForClient,
    onAfterSave,
    onAfterCollectionSave,
    onSsrError,
    collections,
    panels,
  } = options;

  if (!Provider) {
    throw new Error("createCmsPage: `Provider` option is required");
  }
  if (!config) {
    throw new Error("createCmsPage: `config` option is required");
  }
  // Caught here rather than at the first render of a binding: without it the
  // page renders, and the failure surfaces as `useCollectionContext` throwing
  // somewhere far from the wiring that caused it.
  if (collections && !collections.CollectionProvider) {
    throw new Error(
      "createCmsPage: `collections` is missing `CollectionProvider`. Import it from " +
        "\"inscribed/collections\" and pass it alongside the others: " +
        "collections: { CollectionProvider, CollectionRecord, CollectionRows }",
    );
  }

  // Same timing as the `collections` check above, and for the same reason: this
  // runs at module scope, so a mistyped descriptor is named where it was
  // written rather than surfacing as a rail button that opens nothing.
  const normalizedPanels = normalizePanels(panels);

  // Normalized once at module scope, so every request reuses one object.
  const normalizedConfig = ensureCmsConfig(config);

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

  async function CmsPage({ slug, locale, children }) {
    // `headers()` opts a route out of static rendering, so it is read only when
    // something is still unresolved. Pin both `slug` and `locale` and the page
    // never touches them, which is what lets a localized route prerender.
    const needsHeaders = slug == null || (locale == null && normalizedConfig.locales.length > 0);
    const route = needsHeaders
      ? await resolveRouteFromHeaders(normalizedConfig, slug == null)
      : { locale: locale ?? null, slug };

    const resolvedSlug = slug ?? route.slug;
    const resolvedLocale = locale ?? route.locale;

    // The session and the content are independent, so they overlap rather than
    // queue: a session that hits a database or decrypts a JWT would otherwise
    // sit in front of every content request.
    // No catch here: `getCmsPageBlocks` already decides per fetch what a
    // failure means (see `ssr-failure.js`), and what reaches this far is
    // something the page must not render through: a framework bail-out signal,
    // or a build-phase refusal.
    const [session, initialBlocks] = await Promise.all([
      getSession(),
      getCmsPageBlocks(serverConfig, resolvedSlug, {
        contentOptions: { locale: resolvedLocale },
        onSsrError,
      }),
    ]);

    return (
      <Provider config={normalizedConfig} isAdmin={deriveAdmin(session)} userSub={deriveUserSub(session)}
        initialBlocks={initialBlocks} initialRoute={{ slug: resolvedSlug, locale: resolvedLocale }}
        onAfterSave={onAfterSave}
        onAfterCollectionSave={onAfterCollectionSave}
        collections={collections?.CollectionProvider}
        panels={normalizedPanels ?? undefined}
        session={sessionForClient ? sessionForClient(session) : undefined}
      >
        {children}
      </Provider>
    );
  }

  /**
   * Href for `slug` in `locale`, bound to this factory's config.
   *
   * Server Components can't call `useCmsRoute()`, and they are where most links
   * are written, so the same helper is handed back here already knowing the
   * default locale. Client components use the hook's `localePath` instead.
   *
   * @param {string} slug
   * @param {string} [locale]
   * @returns {string}
   */
  function localePath(slug, locale) {
    return localizePath(slug, locale, normalizedConfig);
  }

  /**
   * The active route, split into `{ pathname, slug, locale }`, for Server
   * Components that need the language before rendering: a root layout setting
   * `<html lang>` is the case this exists for.
   *
   * Reads the `x-pathname` header, so the middleware contract stays inside the
   * SDK rather than every app knowing the header's name. Client Components use
   * `useCmsRoute()` instead.
   *
   * @returns {Promise<import("../shared/route.js").CmsRoute>}
   */
  async function getCmsRoute() {
    return resolveCmsRoute(await resolvePathnameFromHeaders(false), normalizedConfig);
  }

  /**
   * Fetch one record for a detail route, and settle the route while doing it:
   * a slug with no record 404s, and a slug that turns out to be an old address
   * redirects to the canonical one before anything renders.
   *
   * Renaming leaves the old slug behind as an alias, so the API answers a read
   * of it with 200 and the canonical `slug` in the body. That is deliberately
   * not a redirect: an HTTP client would follow it silently and the app would
   * never learn the record had moved. Which makes the redirect the app's job,
   * and this is it, so no consumer has to remember the comparison.
   *
   * Two conditions decide whether the redirect reaches the wire as a status at
   * all, both measured rather than assumed: it must be awaited in the page body
   * (not in `generateMetadata`, which streams), and the segment must have no
   * `loading.js` (which flushes the shell first). Miss either and Next falls
   * back to a `<meta http-equiv="refresh">`: right for the visitor, invisible to
   * a crawler. `CollectionItem.metadata` is the placement that does not depend
   * on any of this.
   *
   * `permanentRedirect` emits 308 rather than 301. From a Server Component
   * those are the only two on offer (307 and 308), and Google treats 308 as
   * 301 for canonicalization, so the SEO half holds. The half that doesn't:
   * neither can carry a `Cache-Control`, and a 308 sticks in browser caches as
   * hard as a 301. Rename a slug, then rename it back, and whoever saw the
   * first redirect keeps following it. Route handlers are the way out if that
   * matters more than the one-line setup.
   *
   * @param {string} key
   * @param {string} slug   The slug from the route, canonical or alias.
   * @param {import("./get-content.js").GetCmsContentOptions & { path?: (slug: string) => string }} [options]
   *   `path` builds the redirect target from the canonical slug. Omit it and the
   *   current pathname's last segment is swapped, which is right for the usual
   *   `/news/[slug]` shape and keeps any locale prefix the visitor arrived
   *   under. Pass one when the slug isn't the last segment.
   * @returns {Promise<import("../shared/contracts/schemas.js").CollectionItemResponse>}
   */
  async function resolveCollectionItem(key, slug, options) {
    let item;
    try {
      item = await getCmsCollectionItem(serverConfig, key, slug, options);
    } catch (err) {
      if (/** @type {*} */ (err)?.isNotFound) notFound();
      // Reports and decides whether this render may be cached; the page has no
      // empty state to fall back on, so it never renders either way.
      handleSsrFailure(err, { kind: "collection", target: `${key}/${slug}` }, onSsrError);
      throw err;
    }

    if (item.slug === slug) return item;

    const target = options?.path
      ? options.path(item.slug)
      : await canonicalPathFor(item.slug);
    // Outside the try: `permanentRedirect` signals by throwing, and catching it
    // here would turn the redirect into a failed fetch.
    if (target) permanentRedirect(target);
    return item;
  }

  /**
   * A whole `generateMetadata` for a collection detail route, so the page can
   * say what it is about without also having to know how Next resolves a route.
   *
   * The canonical link is what this is for, and it is the part that always
   * works. Measured against Next 15 in a production build:
   *
   *   - from here, the redirect does *not* reach the wire as a status. Metadata
   *     streams, so the response has already started: Next falls back to a
   *     `<meta http-equiv="refresh">`. The visitor still lands on the right
   *     page; a crawler sees 200, and the canonical link is what tells it where
   *     the record actually lives.
   *   - from the page body it is a real 308, but only while the segment has no
   *     `loading.js`. With one, the shell flushes first and it degrades exactly
   *     as above. And awaiting there costs the page its streaming.
   *
   * So this is the default: the guaranteed half is free, and nothing about it
   * depends on which other files happen to sit in the route. `resolve` in the
   * page body stays available for anyone who wants the hard redirect and can
   * hold to its conditions.
   *
   * The record is read twice, here and in the binding, and fetched once: same
   * URL and same tags, so Next serves the second from its cache. Measured, not
   * assumed: one request per page render reaches the backend.
   *
   * @param {string} key
   * @param {((item: import("../shared/contracts/schemas.js").CollectionItemResponse) => *) | Record<string, *>} [mapOrOptions]
   *   A function mapping the record to metadata fields is the common case.
   *   Pass an object instead to reach the rest: `map` (the same function),
   *   `param` (route segment holding the slug, default `"slug"`), plus anything
   *   `resolveCollectionItem` takes.
   * @returns {(props: { params: * }) => Promise<*>}
   */
  function collectionMetadata(key, mapOrOptions) {
    const options = typeof mapOrOptions === "function"
      ? { map: mapOrOptions }
      : (mapOrOptions ?? {});
    const { map, param = "slug", ...resolveOptions } = options;

    return async function generateMetadata(props) {
      const params = await props?.params;
      const slug = params?.[param];
      if (typeof slug !== "string") {
        throw new Error(
          `CollectionItem.metadata("${key}"): no "${param}" in this route's params. ` +
            'Pass { param: "…" } naming the segment that holds the slug.',
        );
      }

      const item = await resolveCollectionItem(key, slug, resolveOptions);
      // Reached only when the redirect above did not happen, which includes the
      // case where it could not: the canonical link is what carries the record's
      // real address to search engines either way, so it is built from the
      // record rather than from what the route asked for.
      const canonical = resolveOptions.path
        ? resolveOptions.path(item.slug)
        : await canonicalPathFor(item.slug);
      const mapped = map ? await map(item) : null;

      return {
        ...mapped,
        // Spread last so a caller setting its own `alternates` (hreflang for a
        // translated record, say) keeps them, and can override the canonical.
        alternates: { ...(canonical ? { canonical } : null), ...mapped?.alternates },
      };
    };
  }

  const serverCollections = collections
    ? createServerCollections(serverConfig, collections, onSsrError)
    : null;
  if (serverCollections) {
    // Hung off the component instead of only sitting beside it, because these
    // are always used together on a detail route and the factory module is the
    // wrong place to have to remember that: an app already exporting
    // `CollectionItem` reaches both without touching its own wiring.
    serverCollections.CollectionItem.resolve = resolveCollectionItem;
    serverCollections.CollectionItem.metadata = collectionMetadata;
  }

  return { CmsPage, localePath, getCmsRoute, resolveCollectionItem, ...serverCollections };
}

/**
 * The server-rendered binding components. Each is a synchronous shell returning
 * a `<Suspense>` around an async inner component, which is what lets a slow
 * collection stream in *after* the page shell has already been flushed: the
 * consumer writes no boundary of their own, and a collection reading external
 * data can never hold the document back.
 *
 * @param {import("../shared/config.js").CmsConfig} serverConfig
 * @param {CollectionPrimitives} primitives
 * @param {import("./ssr-failure.js").SsrErrorReporter} [onSsrError]
 */
function createServerCollections(serverConfig, { CollectionRecord, CollectionRows }, onSsrError) {
  async function RegionRows({ collection, filter, limit, offset, as, empty, children, rest }) {
    // Resolved here rather than passed down from `CmsPage`: a region can be
    // mounted anywhere in the tree, and this component is already async.
    const { locale } = await resolveRouteFromHeaders(serverConfig, false);
    const params = buildListParams({ filter, limit, offset, locale });

    let items = [];
    try {
      ({ items } = await getCmsCollection(serverConfig, collection, params));
    } catch (err) {
      // Same posture as the block fetch: a page whose collection is unreachable
      // still renders, with the region's own empty branch, but that render is
      // kept out of the cache so it doesn't outlive the outage.
      handleSsrFailure(err, { kind: "collection", target: collection, locale }, onSsrError);
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
      // This one already told absence apart from failure, which is the split
      // `handleSsrFailure` now applies everywhere; it keeps its own `missing`
      // node for the 404 and falls through to `error` for the rest.
      if (/** @type {*} */ (err)?.isNotFound) return missing ?? null;
      handleSsrFailure(err, { kind: "collection", target: `${collection}/${slug}` }, onSsrError);
      return errorNode ?? missing ?? null;
    }
    if (!item) return missing ?? null;

    // `slug` goes through as asked for, not as resolved: `CollectionRecord`
    // reconciles it against the record's own slug (an alias read, or a case the
    // backend normalised) in one place, for this entry point and the client one
    // alike.
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
 * @param {boolean} warnWhenMissing
 *   False when the caller pinned its own slug and only wants the locale: the
 *   header is then a nice-to-have, and warning about it would nag pages that
 *   are already doing the right thing.
 * @returns {Promise<string>}
 */
async function resolvePathnameFromHeaders(warnWhenMissing) {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER);
  if (pathname) return pathname;

  if (
    warnWhenMissing &&
    !warnedMissingPathname &&
    process.env.NODE_ENV !== "production" &&
    isPageRequest(h)
  ) {
    warnedMissingPathname = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] <CmsPage> rendered without a slug prop and no "${PATHNAME_HEADER}" ` +
        'request header was found, so every page will read the blocks of "/".\n' +
        "  Add the middleware from `inscribed/middleware`, widen its matcher to cover " +
        "this route, or pass slug={...} explicitly.",
    );
  }
  return "/";
}

/**
 * Whether the request is a page view rather than an asset fetch.
 *
 * A path the matcher deliberately excludes (`/favicon.ico`, `/robots.txt`) with
 * no file behind it 404s, and Next renders not-found through the root layout:
 * `<CmsPage>` then runs headerless through no fault of the app. Those arrive as
 * image or wildcard-accept requests, so gating on a navigation (`document`), an
 * RSC payload, or HTML keeps the warning for the case that is actually broken.
 *
 * A non-browser client asking for a page with a wildcard `accept` is the trade:
 * it stays silent, but the same missing middleware warns on the first real
 * browser hit.
 *
 * @param {Awaited<ReturnType<typeof headers>>} h
 */
function isPageRequest(h) {
  return (
    h.has("rsc") ||
    h.get("sec-fetch-dest") === "document" ||
    (h.get("accept") ?? "").includes("text/html")
  );
}

/** Once per process: a missing middleware trips this on every page render. */
let warnedMissingPathname = false;

/**
 * Where a record that moved to `canonicalSlug` now lives, derived from the path
 * the visitor asked for by swapping its last segment.
 *
 * That covers `/news/[slug]` and, because `x-pathname` is the pre-rewrite path,
 * carries any locale prefix along with it: `/en/news/old` becomes `/en/news/new`
 * without this knowing the site is localized at all.
 *
 * Returns null when the path has no segment to swap, which in practice means the
 * middleware isn't installed and the header defaulted to "/". Redirecting on a
 * guess would send visitors somewhere that doesn't exist, so the caller renders
 * at the old address instead and dev gets told to pass `path`.
 *
 * @param {string} canonicalSlug
 * @returns {Promise<string | null>}
 */
async function canonicalPathFor(canonicalSlug) {
  const pathname = await resolvePathnameFromHeaders(false);
  const cut = pathname.lastIndexOf("/");
  if (cut < 0 || pathname.slice(cut + 1) === "") {
    if (!warnedMissingRedirectPath && process.env.NODE_ENV !== "production") {
      warnedMissingRedirectPath = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[inscribed] resolveCollectionItem() could not build a redirect target for "${canonicalSlug}" ` +
          `from pathname "${pathname}".\n` +
          "  Add the middleware from `inscribed/middleware`, or pass path: (slug) => `/news/${slug}`.",
      );
    }
    return null;
  }
  return `${pathname.slice(0, cut + 1)}${encodeURIComponent(canonicalSlug)}`;
}

/** Same once-per-process budget as the pathname warning above. */
let warnedMissingRedirectPath = false;

/**
 * Split the request's pathname into `{ locale, slug }`.
 *
 * The locale always comes from the route, even when the caller pins `slug`
 * explicitly: a dynamic route (`/news/[id]`) needs the manifest template rather
 * than the concrete path, but its language is still whatever prefix the visitor
 * arrived under, so the two are resolved independently.
 *
 * @param {CmsConfig} config
 * @param {boolean} warnWhenMissing
 * @returns {Promise<{ locale: string|null, slug: string }>}
 */
async function resolveRouteFromHeaders(config, warnWhenMissing) {
  const pathname = await resolvePathnameFromHeaders(warnWhenMissing);
  const { locale, slug } = resolveCmsRoute(pathname, config);
  return { locale, slug };
}