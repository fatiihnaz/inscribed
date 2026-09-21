/**
 * @file `createCmsPage` factory, server-only, published under `inscribed/page`.
 * One factory call (typically `app/lib/cms.jsx`) holds your config, session
 * strategy, and revalidation; the root layout wraps everything once:
 *
 *   // app/layout.jsx
 *   import { CmsPage } from "./lib/cms.jsx";
 *
 *   export default function RootLayout({ children }) {
 *     return <html><body><CmsPage>{children}</CmsPage></body></html>;
 *   }
 *
 * and every page is just its regions:
 *
 *   import { EditableRegion } from "inscribed";
 *
 *   export default function Page() {
 *     return <main><EditableRegion blockPath="hero.title" as="h1" /></main>;
 *   }
 *
 * `<CmsPage>` reads the whole site's blocks in one request (see
 * `getCmsSiteContent`) and hands them to the provider, so it never needs to
 * know which page is rendering: no request header, nothing per page, and every
 * route prerenders at build. The server-rendered collection bindings hold to
 * the same rule, taking the language from `<CmsPage>` rather than the request.
 *
 * A publish drops the site's cache tag and the next request regenerates the
 * route it hit. On the client, a navigation renders from the same store, so no
 * route ever waits on a fetch, and an editor's drafts are read once for the
 * whole site rather than once per route.
 *
 * On a multilingual site the layout is `app/[locale]/layout.jsx` and passes its
 * segment through, which is the one thing the read is keyed on:
 *
 *   export default async function RootLayout({ children, params }) {
 *     const { locale } = await params;
 *     return <html lang={locale}><body><CmsPage locale={locale}>{children}</CmsPage></body></html>;
 *   }
 *
 * `Provider` is passed in rather than imported so its `"use client"` boundary
 * survives bundling (tsup doesn't preserve the directive across entries).
 */

import { Suspense } from "react";
// Namespace import so `cache` can be feature-detected. It is exported only from
// React's `react-server` build, which is the one a Server Component actually
// runs against, but this module is also loaded by plain Node (tests, a consumer
// on React 18) where a named import of it would be a link error.
import * as ReactExports from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import { getCmsCollection, getCmsCollectionItem, getCmsSiteContent } from "./get-content.js";
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
 * Where `<CmsPage>` leaves the language it resolved, for the collection
 * bindings further down the same request to read.
 *
 * `cache()` gives one object per request, so this is a handoff between two
 * components of one render rather than shared mutable state: the layout body
 * has to return before anything it wraps is rendered, so the write always
 * precedes the reads. Null when React has no `cache` to offer, which is any
 * environment that is not rendering Server Components, and there the readers
 * fall back to the request exactly as they used to.
 *
 * It exists because that fallback is `headers()`, and reading a header opts the
 * whole route out of static rendering. A page carrying one
 * `<CollectionRegion>` was therefore dynamic, which is the one thing
 * `<CmsPage>` goes out of its way not to be.
 *
 * @type {(() => { current: string | null | undefined }) | null}
 */
const requestLocaleSlot = typeof ReactExports.cache === "function"
  ? ReactExports.cache(() => ({ current: /** @type {string | null | undefined} */ (undefined) }))
  : null;

/** @param {string|null} locale */
function publishRequestLocale(locale) {
  if (requestLocaleSlot) requestLocaleSlot().current = locale;
}

/** @returns {string | null | undefined} `undefined` when nothing published one. */
function readRequestLocale() {
  return requestLocaleSlot ? requestLocaleSlot().current : undefined;
}

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
 *   around it. Receives `config`, `isAdmin`, `userSub`, `initialSite`,
 *   `onAfterSave`, `session`, and (when `collections` is given) `collections`.
 *   A wrapper must forward all of them; spreading `{...props}` is what does that.
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
 *   CmsPage: (props: { locale?: string, children: React.ReactNode }) => Promise<React.ReactElement>,
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

  /**
   * The whole site in `locale`, or nothing when the backend is unreachable:
   * `handleSsrFailure` decides whether that empty render may be cached (never)
   * and whether a build may ship it (never).
   *
   * @param {string|null} locale
   * @returns {Promise<import("../core/site-blocks.js").SiteContent>}
   */
  async function readSite(locale) {
    try {
      const site = await getCmsSiteContent(serverConfig, { locale });
      warnIfLarge(site, locale);
      return site;
    } catch (err) {
      handleSsrFailure(err, { kind: "site", target: "*", locale }, onSsrError);
      return EMPTY_SITE;
    }
  }

  /**
   * @param {{ locale?: string, children: React.ReactNode }} props
   */
  async function CmsPage({ locale, children }) {
    // Nothing here reads the request: no header, no cookie. That is what lets
    // every route under this layout prerender, so the one input the read is
    // keyed on, the language, has to come from the segment.
    const localized = normalizedConfig.locales.length > 0;
    if (localized && locale == null) {
      throw new Error(
        "<CmsPage> needs `locale` on a localized site. Render it from app/[locale]/layout.jsx " +
          "and pass the segment through: <CmsPage locale={locale}>.",
      );
    }
    // An unknown segment value is not a language the site has, so it is not a
    // page either. `generateStaticParams` keeps this off the built routes; this
    // is for the request-time miss.
    if (localized && !normalizedConfig.locales.includes(/** @type {string} */ (locale))) notFound();
    const resolvedLocale = localized ? /** @type {string} */ (locale) : null;
    // Published for the collection bindings below, which would otherwise have
    // to read the request to learn the same thing. See `requestLocaleSlot`.
    publishRequestLocale(resolvedLocale);

    // The session and the content are independent, so they overlap rather than
    // queue: a session that hits a database or decrypts a JWT would otherwise
    // sit in front of every content request.
    const [session, initialSite] = await Promise.all([
      getSession(),
      readSite(resolvedLocale),
    ]);

    return (
      <Provider config={normalizedConfig} isAdmin={deriveAdmin(session)} userSub={deriveUserSub(session)}
        initialSite={initialSite}
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
   * The active route, split into `{ pathname, slug, locale }`, for a Server
   * Component that has no `params` of its own to read the language from.
   *
   * Reads the `x-pathname` header the middleware sets, and reading a header
   * opts the route out of static rendering. A layout under `app/[locale]/`
   * has `params.locale` and should use that instead; this is for the odd
   * component with no segment to read. Client Components use `useCmsRoute()`.
   *
   * @returns {Promise<import("../shared/route.js").CmsRoute>}
   */
  async function getCmsRoute() {
    return resolveCmsRoute(await resolvePathnameFromHeaders(), normalizedConfig);
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
   *   `path` builds the redirect target from the canonical slug, and is handed
   *   the language beside it: `(slug, { locale }) => string`. Omit it and the
   *   current pathname's last segment is swapped, which is right for the usual
   *   `/news/[slug]` shape and keeps any locale prefix the visitor arrived
   *   under, but reads the request and so makes the route dynamic.
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

    const target = await canonicalAddress(item.slug, options);
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
   *   `resolveCollectionItem` takes. `path` is the one worth passing: without it
   *   the canonical link is derived from the request and the route goes dynamic.
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
      const canonical = await canonicalAddress(item.slug, resolveOptions, params?.locale);
      const mapped = map ? await map(item) : null;

      return {
        ...mapped,
        // Spread last so a caller setting its own `alternates` (hreflang for a
        // translated record, say) keeps them, and can override the canonical.
        alternates: { ...(canonical ? { canonical } : null), ...mapped?.alternates },
      };
    };
  }

  /**
   * A whole `generateStaticParams` for a collection detail route: the slugs the
   * collection holds, so `next build` renders a page per record rather than
   * leaving every one of them to its first visitor.
   *
   * Pages through the collection rather than asking for all of it at once, and
   * stops at `max`. Past that the records still work: Next renders an unlisted
   * slug on demand unless the route sets `dynamicParams = false`.
   *
   * On a localized site Next runs this once per language and hands it the
   * parent segment's params, so the rows come back in the language the pages
   * are being built in.
   *
   * A read that fails here fails the build, deliberately: a detail route with
   * no params is a route with no pages, and shipping that as a green deploy is
   * the outcome this exists to prevent.
   *
   * @param {string} key
   * @param {{ param?: string, filter?: Record<string, *>, pageSize?: number, max?: number }} [options]
   *   `param` names the segment holding the slug (default `"slug"`).
   * @returns {(props?: { params?: * }) => Promise<Record<string, string>[]>}
   */
  function collectionStaticParams(key, options) {
    const { param = "slug", filter, pageSize = 100, max = 1000 } = options ?? {};

    return async function generateStaticParams(props) {
      const params = await props?.params;
      const locale = params?.locale ?? null;

      /** @type {Record<string, string>[]} */
      const out = [];
      let total = Infinity;
      for (let offset = 0; out.length < max && out.length < total; offset += pageSize) {
        const page = await getCmsCollection(
          serverConfig, key, buildListParams({ filter, limit: pageSize, offset, locale }),
        );
        total = page.total;
        if (page.items.length === 0) break;
        for (const item of page.items) {
          if (out.length >= max) break;
          out.push({ [param]: item.slug });
        }
      }

      if (total > max && !warnedStaticParamsCap && process.env.NODE_ENV !== "production") {
        warnedStaticParamsCap = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[inscribed] CollectionItem.staticParams("${key}") stopped at ${max} of ${total} records. ` +
            "The rest render on their first request; raise `max` to prerender them.",
        );
      }
      return out;
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
    serverCollections.CollectionItem.staticParams = collectionStaticParams;
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
  async function RegionRows({ collection, filter, limit, offset, locale: pinned, as, empty, children, rest }) {
    const locale = pinned !== undefined ? pinned : await regionLocale(serverConfig);
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

  /**
   * @param {Record<string, *>} props
   *   `locale` pins the language of the window. Omit it and the region reads
   *   the one `<CmsPage>` resolved for this request, which is the right answer
   *   on every page under it; pass one for a sidebar deliberately showing
   *   another language's rows, or `null` to ask for the collection's default.
   */
  function CollectionRegion({ collection, filter, limit, offset, locale, as, fallback, empty, children, ...rest }) {
    return (
      <Suspense fallback={fallback ?? null}>
        <RegionRows
          collection={collection} filter={filter} limit={limit} offset={offset}
          locale={locale} as={as} empty={empty} rest={rest}
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
 * Read the pathname from the `x-pathname` header set by `inscribed/middleware`,
 * falling back to `/` without it. `await` covers both Next 14 (sync `headers()`)
 * and Next 15 (async).
 *
 * Reading it makes the route dynamic, so the callers are the ones that have no
 * other source for what they need: `getCmsRoute`, the canonical-path builder
 * behind a record redirect, and a collection region rendered outside
 * `<CmsPage>`. `<CmsPage>` itself never reads it, which is what keeps the
 * routes under it static.
 *
 * @returns {Promise<string>}
 */
async function resolvePathnameFromHeaders() {
  const h = await headers();
  return h.get(PATHNAME_HEADER) || "/";
}

/** Nothing read, in the shape the provider seeds from. */
const EMPTY_SITE = { pages: [], global: [] };

// Past this the RSC payload starts to weigh on every hard load: the site rides
// in the root layout's props, once per document. Compressed it is a fraction,
// but a site this size is where splitting the read starts to pay.
const SITE_PAYLOAD_WARN_BYTES = 300_000;
let warnedLargeSite = false;

/**
 * @param {import("../core/site-blocks.js").SiteContent} site
 * @param {string|null} locale
 */
function warnIfLarge(site, locale) {
  if (process.env.NODE_ENV === "production" || warnedLargeSite) return;
  const bytes = JSON.stringify(site).length;
  if (bytes < SITE_PAYLOAD_WARN_BYTES) return;
  warnedLargeSite = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[inscribed] the site's blocks${locale ? ` (${locale})` : ""} serialize to ${Math.round(bytes / 1024)} KB, ` +
      "which every hard load carries in the page payload. Large RichText values are the usual reason.",
  );
}

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
  const pathname = await resolvePathnameFromHeaders();
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
let warnedDerivedCanonical = false;
let warnedStaticParamsCap = false;

/**
 * Where a record canonically lives: the redirect target when a slug turns out
 * to be an old address, and the canonical link either way.
 *
 * `path` is what keeps a detail route static. Without it the address is derived
 * from the request, and reading the request opts the whole route out of static
 * rendering, so a page whose metadata goes through here is dynamic for the sake
 * of one link. It is handed the locale as well as the slug, because on a
 * localized site the address carries a prefix nothing here can know.
 *
 * @param {string} slug   The record's own slug, not the one asked for.
 * @param {{ path?: (slug: string, context: { locale: string|null }) => string, locale?: string|null } | undefined} options
 * @param {string|null} [routeLocale]   The segment's locale, where a caller has one.
 * @returns {Promise<string | null>}
 */
async function canonicalAddress(slug, options, routeLocale) {
  const locale = routeLocale ?? options?.locale ?? readRequestLocale() ?? null;
  if (options?.path) return options.path(slug, { locale });

  if (!warnedDerivedCanonical && process.env.NODE_ENV !== "production") {
    warnedDerivedCanonical = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[inscribed] a collection detail route is building its canonical address from the request, " +
        "which makes that route dynamic. Pass path: (slug, { locale }) => localePath(`/news/${slug}`, locale) " +
        "to keep it static.",
    );
  }
  return canonicalPathFor(slug);
}

/**
 * The language a collection region should read, for a region that was not
 * given one.
 *
 * `<CmsPage>` publishes it (see `requestLocaleSlot`), which covers every page under
 * the layout and costs nothing. The header read below is the fallback for a
 * region rendered outside one, and it is what makes that route dynamic, so it
 * says so once in development rather than leaving the deopt to be discovered
 * in a build log.
 *
 * @param {CmsConfig} config
 * @returns {Promise<string|null>}
 */
async function regionLocale(config) {
  const published = readRequestLocale();
  if (published !== undefined) return published;
  // Only worth saying where the handoff was available and went unused; without
  // `cache` there is no `<CmsPage>` placement that would have helped.
  if (requestLocaleSlot && !warnedRegionHeaderRead && process.env.NODE_ENV !== "production") {
    warnedRegionHeaderRead = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[inscribed] a server <CollectionRegion> is rendering with no <CmsPage> above it, so its " +
        "language is being read from the request headers, which makes this route dynamic. " +
        "Render it under <CmsPage>, or pass locale={...} to the region.",
    );
  }
  const { locale } = resolveCmsRoute(await resolvePathnameFromHeaders(), config);
  return locale;
}

/** Same once-per-process budget as the warnings above. */
let warnedRegionHeaderRead = false;