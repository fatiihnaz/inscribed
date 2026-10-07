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

import { Suspense, cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import { getCmsCollection, getCmsCollectionItem, getCmsSiteContent } from "./get-content.js";
import { EMPTY_SITE } from "../core/site-blocks.js";
import { ensureCmsConfig } from "../shared/config.js";
import { normalizePanels } from "../shared/panels.js";
import { localizePath, recordPath, resolveCmsRoute } from "../shared/route.js";
import { buildListParams } from "../collections/params.js";
import { publicAuth } from "../defaults/auth.js";
import { handleSsrFailure } from "./ssr-failure.js";
import {
  absoluteUrl, fillSlug, imageOf, languageLinks, pageSeoFields, recordLanguages, recordSeoFields,
  seedIn, seoMetadata, textOf,
} from "../shared/seo.js";

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
 * components of one render rather than shared mutable state. It is not ordered,
 * though: Next renders a page beside its layout, not inside it, so a page that
 * renders synchronously under a layout that awaits `params` reads before
 * `<CmsPage>` writes (see `regionLocale`). Outside a Server Component render
 * `cache()` memoizes nothing, so each call gets a fresh slot and the readers
 * fall back to the request.
 *
 * It exists because that fallback is `headers()`, and reading a header opts the
 * whole route out of static rendering. A page carrying one
 * `<CollectionRegion>` was therefore dynamic, which is the one thing
 * `<CmsPage>` goes out of its way not to be.
 *
 * @type {() => { current: string | null | undefined }}
 */
const requestLocaleSlot = cache(() => ({ current: /** @type {string | null | undefined} */ (undefined) }));

/** @param {string|null} locale */
function publishRequestLocale(locale) {
  requestLocaleSlot().current = locale;
}

/** @returns {string | null | undefined} `undefined` when nothing published one. */
function readRequestLocale() {
  return requestLocaleSlot().current;
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
 *
 *   Awaited in the root layout, so a resolver that reads the request
 *   (`cookies()`, `headers()`, which most session libraries do) opts every
 *   route out of static rendering: the site then renders per request rather
 *   than at build. Leave it out and decide admin in the browser to keep the
 *   site static; the built-in browser auth works that way.
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
 *   CmsPage: ((props: { locale?: string, children: React.ReactNode }) => Promise<React.ReactElement>) & {
 *     metadata: (slug: string, defaults?: { title?: *, description?: *, image?: *, noindex?: * }) =>
 *       (props: { params?: * }, parent?: import("next").ResolvingMetadata) => Promise<import("next").Metadata>,
 *     siteMetadata: (options?: { siteName?: string | Record<string, string>, titleTemplate?: string | Record<string, string> }) =>
 *       (props: { params?: * }) => Promise<import("next").Metadata>,
 *     sitemap: (options?: { extra?: string[], exclude?: string[] }) => () => Promise<import("next").MetadataRoute.Sitemap>,
 *   },
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

  // Once per request: the layout and the metadata helpers all read the site,
  // and an outage should reach `onSsrError` once, not once per reader.
  const readSiteOnce = cache(readSite);
  const localized = normalizedConfig.locales.length > 0;

  /**
   * The language a metadata helper renders in, or `undefined` for a segment
   * value that is not one, which `<CmsPage>` answers with a 404 anyway.
   *
   * @param {Record<string, *>} params
   * @returns {string | null | undefined}
   */
  function metadataLocale(params) {
    if (!localized) return null;
    return normalizedConfig.locales.includes(params.locale) ? params.locale : undefined;
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
    const resolvedLocale = localized ? /** @type {string} */ (locale) : null;
    // Published for the collection bindings below, which would otherwise have
    // to read the request to learn the same thing. See `requestLocaleSlot`.
    // Ahead of the check that follows, so a binding on an unknown language
    // answers the same 404 instead of reading the request.
    publishRequestLocale(resolvedLocale);
    // An unknown segment value is not a language the site has, so it is not a
    // page either. A path with a dot skips the proxy and arrives here as it is.
    if (localized && !normalizedConfig.locales.includes(/** @type {string} */ (locale))) notFound();

    // The session and the content are independent, so they overlap rather than
    // queue: a session that hits a database or decrypts a JWT would otherwise
    // sit in front of every content request.
    const [session, initialSite] = await Promise.all([
      getSession(),
      readSiteOnce(resolvedLocale),
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
   * A whole `generateMetadata` for a page whose title, description, share image
   * and indexing editors manage from the drawer. `cms-sync` reads this call and
   * gives the page `seo.title`, `seo.description`, `seo.image` and `seo.noindex`,
   * seeded from `defaults` (one value or one per language).
   *
   * The slug is written out because `generateMetadata` is never told the page's
   * address, only its params; `cms-sync` fails when it differs from the one the
   * file derives.
   *
   * @param {string} slug   The page's slug, as `cms-sync --dry-run` lists it.
   * @param {{ title?: *, description?: *, image?: *, noindex?: boolean | Record<string, boolean> }} [defaults]
   * @returns {(props: { params?: * }, parent?: Promise<*>) => Promise<Record<string, *>>}
   */
  function pageMetadata(slug, defaults) {
    if (typeof slug !== "string" || !slug.startsWith("/")) {
      throw new Error(`CmsPage.metadata: the first argument is the page's slug, a path starting with "/". Got ${JSON.stringify(slug)}.`);
    }
    return async function generateMetadata(props, parent) {
      const params = (await props?.params) ?? {};
      const locale = metadataLocale(params);
      if (locale === undefined) return {};

      const [site, inherited] = await Promise.all([readSiteOnce(locale), parent]);
      const page = site.pages.find((entry) => entry.slug === slug);
      warnIfUnsynced(slug, page, site);
      if (localized) warnIfRelativeLinks(normalizedConfig, inherited);

      const path = fillSlug(slug, params);
      return seoMetadata({
        fields: pageSeoFields(page?.blocks, defaults, locale, normalizedConfig.locales),
        canonical: absoluteUrl(localePath(path, locale ?? undefined), normalizedConfig.siteUrl),
        languages: localized ? languageLinks(path, normalizedConfig) : undefined,
        // The home page's title is the site's own, so the template would name the site twice.
        absoluteTitle: slug === "/",
        inherited: inherited?.openGraph,
      });
    };
  }

  /**
   * A whole `generateMetadata` for the root layout: `metadataBase` from
   * `siteUrl`, the title template, and the home page's `seo.image` as the share
   * image of every page that has none of its own.
   *
   * @param {{ siteName?: string | Record<string, string>, titleTemplate?: string | Record<string, string> }} [options]
   *   `titleTemplate` defaults to `"%s | {siteName}"`.
   * @returns {(props: { params?: * }) => Promise<Record<string, *>>}
   */
  function siteMetadata(options) {
    return async function generateMetadata(props) {
      const params = (await props?.params) ?? {};
      const locale = metadataLocale(params);
      if (locale === undefined) return {};

      const name = textOf(seedIn(options?.siteName, locale, normalizedConfig.locales));
      const template = seedIn(options?.titleTemplate, locale, normalizedConfig.locales) ?? `%s | ${name}`;
      const site = await readSiteOnce(locale);
      const home = site.pages.find((entry) => entry.slug === "/");
      const image = imageOf(home?.blocks.find((block) => block.blockPath === "seo.image")?.value);

      return {
        ...(normalizedConfig.siteUrl ? { metadataBase: new URL(normalizedConfig.siteUrl) } : null),
        ...(name ? { title: { default: name, template } } : null),
        openGraph: {
          type: "website",
          ...(name ? { siteName: name } : null),
          ...(image ? { images: [image] } : null),
        },
      };
    };
  }

  /**
   * A whole `app/sitemap.js`: every page the site has content for, in every
   * language and with hreflang, and every record of a collection whose `seo`
   * entry names a `path`, dated by its last update. Whatever is noindex stays
   * out. Read under the same cache tags as the pages, so a publish refreshes it.
   *
   * A failed read throws rather than serving an empty sitemap: a crawler retries
   * an error, but reads an empty sitemap as a site with nothing on it.
   *
   * @param {{ extra?: string[], exclude?: string[] }} [options]
   *   `extra` lists pages with no CMS content (`/iletisim`), in every language;
   *   `exclude` drops slugs from the list.
   * @returns {() => Promise<import("next").MetadataRoute.Sitemap>}
   */
  function sitemap(options) {
    const siteUrl = normalizedConfig.siteUrl;
    if (!siteUrl) {
      throw new Error("CmsPage.sitemap needs siteUrl in createCmsConfig: a sitemap lists absolute addresses.");
    }
    const exclude = new Set(options?.exclude ?? []);
    const locales = localized ? normalizedConfig.locales : [null];

    return async function generateSitemap() {
      const sites = await Promise.all(locales.map((locale) => getCmsSiteContent(serverConfig, { locale })));

      /** @type {Map<string, Set<string|null>>} */
      const indexable = new Map();
      sites.forEach((site, i) => {
        for (const page of site.pages) {
          if (page.slug.includes("[") || exclude.has(page.slug)) continue;
          if (pageSeoFields(page.blocks, undefined, locales[i], normalizedConfig.locales).noindex) continue;
          if (!indexable.has(page.slug)) indexable.set(page.slug, new Set());
          /** @type {Set<string|null>} */ (indexable.get(page.slug)).add(locales[i]);
        }
      });
      for (const slug of options?.extra ?? []) {
        if (!exclude.has(slug)) indexable.set(slug, new Set(locales));
      }

      /** @type {import("next").MetadataRoute.Sitemap} */
      const entries = [];
      for (const slug of [...indexable.keys()].sort()) {
        const pageLocales = /** @type {Set<string|null>} */ (indexable.get(slug));
        const languages = localized
          ? Object.fromEntries(Object.entries(languageLinks(slug, normalizedConfig))
            .filter(([tag]) => pageLocales.has(tag === "x-default" ? normalizedConfig.defaultLocale : tag)))
          : {};
        const alternates = pageLocales.size > 1 ? { alternates: { languages } } : null;
        for (const locale of locales) {
          if (!pageLocales.has(locale)) continue;
          entries.push({ url: absoluteUrl(localePath(slug, locale ?? undefined), siteUrl), ...alternates });
        }
      }

      for (const [key, seo] of Object.entries(normalizedConfig.seo ?? {})) {
        if (seo.path) entries.push(...await recordEntries(key, seo, recordPathOf(seo.path), locales));
      }
      return entries;
    };
  }

  /**
   * One collection's records for the sitemap, every language's rows read first
   * so hreflang only points at translations that are listed themselves.
   *
   * @param {string} key
   * @param {import("../shared/config.js").CollectionSeo} seo
   * @param {(slug: string, context: { locale: string|null }) => string} pathOf
   * @param {(string|null)[]} locales
   * @returns {Promise<import("next").MetadataRoute.Sitemap>}
   */
  async function recordEntries(key, seo, pathOf, locales) {
    const PAGE_SIZE = 100;
    /** @type {Map<string, import("../shared/contracts/schemas.js").CollectionItemResponse>} */
    const listed = new Map();
    for (const locale of locales) {
      for (let offset = 0, total = Infinity; offset < total; offset += PAGE_SIZE) {
        const page = await getCmsCollection(serverConfig, key, buildListParams({ limit: PAGE_SIZE, offset, locale }));
        total = page.total;
        if (page.items.length === 0) break;
        for (const item of page.items) {
          // A collection with no languages answers every language's read alike.
          if (!recordSeoFields(item.data, seo).noindex) listed.set(`${item.locale ?? ""}:${item.slug}`, item);
        }
      }
    }

    const siteUrl = /** @type {string} */ (normalizedConfig.siteUrl);
    /** @type {import("next").MetadataRoute.Sitemap} */
    const entries = [];
    for (const item of listed.values()) {
      const translations = item.translations?.filter((t) => listed.has(`${t.locale ?? ""}:${t.slug}`));
      const languages = localized ? recordLanguages({ ...item, translations }, pathOf, normalizedConfig) : undefined;
      const image = recordSeoFields(item.data, seo).image;
      entries.push({
        url: absoluteUrl(pathOf(item.slug, { locale: item.locale ?? normalizedConfig.defaultLocale }), siteUrl),
        ...(item.updatedAt ? { lastModified: item.updatedAt } : null),
        ...(languages ? { alternates: { languages } } : null),
        ...(image ? { images: [image.url] } : null),
      });
    }
    return entries;
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
   * Reads the `x-pathname` header the proxy sets, and reading a header opts the
   * route out of static rendering; called from a root layout or `not-found.js`,
   * which every route renders, it makes the whole site dynamic. A layout under
   * `app/[locale]/` has `params.locale` and should use that instead, and a
   * component with no segment of its own can read it from `next/root-params`.
   * Client Components use `useCmsRoute()`.
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
    return settleCollectionItem(key, slug, options);
  }

  /**
   * `resolveCollectionItem` with the route's language handed in, for the one
   * caller that has it. `generateMetadata` renders beside the layout rather
   * than under it, so the slot `<CmsPage>` publishes may not be filled yet when
   * a redirect is built from there; `params.locale` is, and is what the
   * canonical link already uses. The page body needs nothing of the sort: it
   * renders after the layout, and the slot is filled by then.
   *
   * @param {string} key
   * @param {string} slug
   * @param {import("./get-content.js").GetCmsContentOptions & { path?: (slug: string) => string }} [options]
   * @param {string|null} [routeLocale]
   * @returns {Promise<import("../shared/contracts/schemas.js").CollectionItemResponse>}
   */
  async function settleCollectionItem(key, slug, options, routeLocale) {
    // Read in the route's language: the backend answers that language's
    // translation, which the slug comparison below turns into a redirect, and a
    // 404 when there is none, rather than serving another language's record here.
    // `locale: null` reads without one.
    const asked = options?.locale !== undefined ? options.locale : readRequestLocale();
    const locale = localized ? routeLocale ?? asked ?? undefined : undefined;
    let item;
    try {
      item = await getCmsCollectionItem(serverConfig, key, slug, { ...options, locale });
    } catch (err) {
      if (/** @type {*} */ (err)?.isNotFound) notFound();
      // Reports and decides whether this render may be cached; the page has no
      // empty state to fall back on, so it never renders either way.
      handleSsrFailure(err, { kind: "collection", target: `${key}/${slug}` }, onSsrError);
      throw err;
    }

    if (item.slug === slug) return item;

    const target = await canonicalAddress(item.slug, options, routeLocale);
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
   * works. Measured against Next 15, and again on Next 16 for a page built on
   * demand, in a production build:
   *
   *   - from here, the redirect does *not* reach the wire as a status. Metadata
   *     streams, so the response has already started: Next falls back to a
   *     `<meta http-equiv="refresh">`, and a 404 to a not-found page sent with
   *     200 and `noindex`. The visitor still lands on the right page; a crawler
   *     sees 200, and the canonical link is what tells it where the record
   *     actually lives. An `htmlLimitedBots` in next.config matching every
   *     user agent turns the streaming off, and both become real statuses.
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
   * A collection with an entry under `seo` in the config needs nothing more:
   * its `path` builds the addresses, its fields fill the title, description,
   * share image and noindex, and the record's translations become hreflang.
   *
   * @param {string} key
   * @param {((item: import("../shared/contracts/schemas.js").CollectionItemResponse) => *) | Record<string, *>} [mapOrOptions]
   *   A function mapping the record to metadata fields, which win over the
   *   `seo` ones. Pass an object instead to reach the rest: `map` (the same
   *   function), `param` (route segment holding the slug, default `"slug"`),
   *   plus anything `resolveCollectionItem` takes. Without a `path` here or in
   *   the config, the canonical link is derived from the request and the route
   *   goes dynamic.
   * @returns {(props: { params: * }, parent?: import("next").ResolvingMetadata) => Promise<import("next").Metadata>}
   */
  function collectionMetadata(key, mapOrOptions) {
    const options = typeof mapOrOptions === "function"
      ? { map: mapOrOptions }
      : (mapOrOptions ?? {});
    const { map, param = "slug", ...rest } = options;
    const seo = normalizedConfig.seo?.[key] ?? null;
    const resolveOptions = rest.path || !seo?.path ? rest : { ...rest, path: recordPathOf(seo.path) };

    return async function generateMetadata(props, parent) {
      const params = await props?.params;
      const slug = params?.[param];
      if (typeof slug !== "string") {
        throw new Error(
          `CollectionItem.metadata("${key}"): no "${param}" in this route's params. ` +
            'Pass { param: "…" } naming the segment that holds the slug.',
        );
      }

      const item = await settleCollectionItem(key, slug, resolveOptions, params?.locale);
      // Reached only when the redirect above did not happen, which includes the
      // case where it could not: the canonical link is what carries the record's
      // real address to search engines either way, so it is built from the
      // record rather than from what the route asked for. That includes its
      // language: a record of a collection with none answers under every prefix,
      // and only the default language's address may call itself canonical.
      const canonicalLocale = localized ? item.locale ?? normalizedConfig.defaultLocale : params?.locale;
      const address = await canonicalAddress(item.slug, resolveOptions, canonicalLocale);
      const canonical = address ? absoluteUrl(address, normalizedConfig.siteUrl) : null;
      const languages = localized && resolveOptions.path
        ? recordLanguages(item, resolveOptions.path, normalizedConfig)
        : undefined;
      const [mapped, inherited] = await Promise.all([map ? map(item) : null, parent]);
      if (languages) warnIfRelativeLinks(normalizedConfig, inherited);

      const base = seo
        ? seoMetadata({ fields: recordSeoFields(item.data, seo), canonical, languages, inherited: inherited?.openGraph })
        : { alternates: { ...(canonical ? { canonical } : null), ...(languages ? { languages } : null) } };
      return {
        ...base,
        ...mapped,
        // Merged last so a caller's own `alternates` keep what they do not set.
        alternates: { ...base.alternates, ...mapped?.alternates },
      };
    };
  }

  /**
   * @param {string} template   A record's address, e.g. `/news/[slug]`.
   * @returns {(slug: string, context: { locale: string|null }) => string}
   */
  function recordPathOf(template) {
    return (slug, { locale }) => localePath(recordPath(template, slug), locale ?? undefined);
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

  CmsPage.metadata = pageMetadata;
  CmsPage.siteMetadata = siteMetadata;
  CmsPage.sitemap = sitemap;

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

  async function RecordBody({ collection, slug, locale: pinned, group, label, missing, error: errorNode, children }) {
    // The page's language, as `CollectionItem.metadata` reads it, so the two
    // reads are one request and agree on which translation is shown.
    const locale = pinned !== undefined ? pinned ?? undefined : itemLocale(serverConfig);
    let item = null;
    try {
      item = await getCmsCollectionItem(serverConfig, collection, slug, locale ? { locale } : undefined);
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

  /**
   * @param {Record<string, *>} props
   *   `locale` pins the language read, `null` for none. Omit it and the record
   *   is read in the page's language: its translation when it is in another.
   */
  function CollectionItem({ collection, slug, locale, group, label, fallback, missing, error: errorNode, children }) {
    return (
      <Suspense fallback={fallback ?? null}>
        <RecordBody
          collection={collection} slug={slug} locale={locale} group={group} label={label}
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
 * falling back to `/` without it.
 *
 * Reading it makes the route dynamic, so the callers are the ones that have no
 * other source for what they need: `getCmsRoute`, the canonical-path builder
 * behind a record redirect, and a collection region that renders before
 * `<CmsPage>` has published the language. `<CmsPage>` itself never reads it,
 * which is what keeps the routes under it static.
 *
 * @returns {Promise<string>}
 */
async function resolvePathnameFromHeaders() {
  const h = await headers();
  return h.get(PATHNAME_HEADER) || "/";
}

// Past this the RSC payload starts to weigh on every hard load: the site rides
// in the root layout's props, once per document. Compressed it is a fraction of
// this, and a navigation costs nothing either way; what grows is the first load.
const SITE_PAYLOAD_WARN_BYTES = 300_000;
/** How many of the heaviest slugs to name. Enough to point somewhere, few enough to read. */
const SITE_PAYLOAD_WARN_SLUGS = 3;
let warnedLargeSite = false;

/** @param {number} bytes */
const asKb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/**
 * Say how heavy the payload is and which slugs carry it. Which slugs is the
 * part worth having: the total says there is a problem, the list says where,
 * and what to do about it is a question about the content rather than about
 * this read.
 *
 * Sized entry by entry rather than whole, so the total and the offenders come
 * out of one pass.
 *
 * @param {import("../core/site-blocks.js").SiteContent} site
 * @param {string|null} locale
 */
function warnIfLarge(site, locale) {
  if (process.env.NODE_ENV === "production" || warnedLargeSite) return;

  const sized = [...site.pages, ...site.global]
    .map((entry) => ({ slug: entry.slug, bytes: JSON.stringify(entry).length }));
  const bytes = sized.reduce((total, entry) => total + entry.bytes, 0);
  if (bytes < SITE_PAYLOAD_WARN_BYTES) return;
  warnedLargeSite = true;

  const heaviest = sized
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, SITE_PAYLOAD_WARN_SLUGS)
    .map((entry) => `${entry.slug} (${asKb(entry.bytes)})`)
    .join(", ");

  // eslint-disable-next-line no-console
  console.warn(
    `[inscribed] the site's blocks${locale ? ` (${locale})` : ""} serialize to ${asKb(bytes)}, ` +
      `which every hard load carries in the page payload. Heaviest: ${heaviest}.`,
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
let warnedRelativeLinks = false;
/** @type {Set<string>} */
const warnedUnsynced = new Set();

/**
 * @param {string} slug
 * @param {import("../shared/contracts/schemas.js").SitePageContent | undefined} page
 * @param {import("../core/site-blocks.js").SiteContent} site
 */
function warnIfUnsynced(slug, page, site) {
  // An empty site is a failed read, which has already said so.
  if (process.env.NODE_ENV === "production" || site.pages.length === 0 || warnedUnsynced.has(slug)) return;
  if (page?.blocks.some((block) => block.blockPath.startsWith("seo."))) return;
  warnedUnsynced.add(slug);
  // eslint-disable-next-line no-console
  console.warn(
    `[inscribed] CmsPage.metadata("${slug}"): the backend holds no seo blocks for this page, so the ` +
      "defaults in code are showing. Run cms-sync, and compare the slug with what cms-sync --dry-run lists.",
  );
}

/**
 * @param {CmsConfig} config
 * @param {Record<string, *> | null | undefined} inherited   The parent segments' resolved metadata.
 */
function warnIfRelativeLinks(config, inherited) {
  if (config.siteUrl || inherited?.metadataBase || warnedRelativeLinks) return;
  if (process.env.NODE_ENV === "production") return;
  warnedRelativeLinks = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[inscribed] hreflang links are relative, and search engines only read absolute ones. " +
      "Set siteUrl in createCmsConfig (or metadataBase in the root layout).",
  );
}

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
 * `<CmsPage>` publishes it (see `requestLocaleSlot`), which costs nothing when
 * it got there first. The header read below is the fallback for a region that
 * rendered before it, or outside one, and it is what makes the route dynamic,
 * so it says so once, during the build too, since that is where a route turns
 * dynamic.
 *
 * @param {CmsConfig} config
 * @returns {Promise<string|null>}
 */
async function regionLocale(config) {
  // A single-language site has no language to find, so the order never matters.
  if (!config.locales?.length) return null;
  const published = readRequestLocale();
  if (published !== undefined) {
    // `<CmsPage>` publishes an unknown language too, then answers it with a 404.
    if (published !== null && !config.locales.includes(published)) notFound();
    return published;
  }
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (!warnedRegionHeaderRead && (building || process.env.NODE_ENV !== "production")) {
    warnedRegionHeaderRead = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[inscribed] a server <CollectionRegion> rendered before <CmsPage> had published the route's " +
        "language, so it is read from the request headers, which makes this route dynamic. A page " +
        "that renders synchronously under a layout that awaits params does this: make the page " +
        "async and await its params, or pass locale={...} to the region.",
    );
  }
  const { locale } = resolveCmsRoute(await resolvePathnameFromHeaders(), config);
  return locale;
}

/** Same once-per-process budget as the warnings above. */
let warnedRegionHeaderRead = false;
let warnedItemBeforeLocale = false;

/**
 * The language a server collection item reads in when it was not given one:
 * what `<CmsPage>` published, never the request, which would make the route
 * dynamic where an item never did. One that renders first reads its record as
 * it was asked for.
 *
 * @param {CmsConfig} config
 * @returns {string | undefined}
 */
function itemLocale(config) {
  if (!config.locales?.length) return undefined;
  const published = readRequestLocale();
  if (published === undefined) {
    const building = process.env.NEXT_PHASE === "phase-production-build";
    if (!warnedItemBeforeLocale && (building || process.env.NODE_ENV !== "production")) {
      warnedItemBeforeLocale = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[inscribed] a server <CollectionItem> rendered before <CmsPage> had published the route's " +
          "language, so it reads its record in none, and CollectionItem.metadata may show another " +
          "translation. Make the page async and await its params, or pass locale={...} to the item.",
      );
    }
    return undefined;
  }
  if (published !== null && !config.locales.includes(published)) notFound();
  return published ?? undefined;
}