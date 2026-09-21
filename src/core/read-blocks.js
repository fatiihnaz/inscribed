/**
 * @file Reading blocks over the wire, in the two shapes a backend can answer.
 *
 * A visitor never comes here: the site arrived with the page and every route
 * renders from the store. An editor does, because only a request carrying their
 * credential comes back with `draftValue` and the versions a save is written
 * against, and so does the translation panel, which wants a language nobody is
 * reading.
 *
 * Both reads hand back the same `{ pages, global }` shape the server gives
 * `<CmsPage>`, so every caller seeds the store through one function.
 */

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { SiteContent } from "./site-blocks.js"
 */

/**
 * Whether the site is read whole, in one request per language, or page by page.
 *
 * `config.slugs` is the switch, and the only one, for the server read
 * (`getCmsSiteContent`) and the editor's read in the browser alike. The two
 * must agree: a backend that answers the whole-site read for one side and not
 * the other renders for visitors and fails for editors.
 *
 * Worth asking before reading rather than after, because it decides what a
 * read is keyed on: a whole-site read covers a language, so it is cached and
 * re-run per language, while the fallback covers one route and has to be cached
 * and re-run per route.
 *
 * @param {CmsConfig} config
 * @param {import("../shared/contracts/transport.js").CmsTransport} [transport]
 *   The transport that will do the reading; `config.transport` when omitted.
 * @returns {boolean}
 */
export function readsWholeSite(config, transport = config.transport) {
  if (config.slugs?.length) return false;
  return typeof transport?.getSiteContent === "function";
}

/**
 * One language, whichever way this backend allows: the whole site in one
 * request, or the named route page by page.
 *
 * @param {{
 *   config: CmsConfig,
 *   slug: string,
 *   locale?: string | null,
 *   accessToken?: string | null,
 *   signal?: AbortSignal,
 * }} input
 *   `slug` is read only on the fallback path, and names the route to read.
 * @returns {Promise<SiteContent>}
 */
export function readLanguage({ config, slug, locale, accessToken, signal }) {
  return readsWholeSite(config)
    ? fetchSiteBlocks({ config, locale, accessToken, signal })
    : fetchRouteBlocks({ config, slug, locale, accessToken, signal });
}

/**
 * The whole site in one language, in one request. Reading it once per session
 * rather than once per route is what makes an editor's navigation cost the same
 * as a visitor's, which is nothing.
 *
 * @param {{
 *   config: CmsConfig,
 *   locale?: string | null,
 *   accessToken?: string | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<SiteContent>}
 */
export async function fetchSiteBlocks({ config, locale, accessToken, signal }) {
  const { pages, global } = await config.transport.getSiteContent({
    accessToken: accessToken || undefined,
    locale: locale ?? undefined,
    signal,
  });
  return { pages, global };
}

/**
 * One route's blocks: the page fetch and the global slug's beside it. The
 * fallback, for a backend that answers no whole-site read.
 *
 * The global slug is fetched in the route's own locale. A Turkish page showing
 * an English header would be worse than no header at all.
 *
 * @param {{
 *   config: CmsConfig,
 *   slug: string,
 *   locale?: string | null,
 *   accessToken?: string | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<SiteContent>}
 */
export async function fetchRouteBlocks({ config, slug, locale, accessToken, signal }) {
  // None when there is no global slug, and none when the page is the global
  // slug itself, which would otherwise be fetched twice.
  const globalSlug = config.globalSlug && config.globalSlug !== slug ? config.globalSlug : null;
  const opts = { accessToken: accessToken || undefined, locale, signal };

  const [pageResponse, globalResponse] = await Promise.all([
    config.transport.getContent(slug, opts),
    globalSlug
      // A page without a global slug is ordinary, and so is a global slug the
      // backend has nothing for; neither is worth failing the page over.
      ? config.transport.getContent(globalSlug, opts).catch(() => ({ slug: globalSlug, blocks: [] }))
      : Promise.resolve({ slug: "", blocks: [] }),
  ]);

  return {
    pages: [{ slug, blocks: pageResponse.blocks }],
    // Only the one configured slug, unlike the whole-site read, which returns
    // every global the backend recognises. This path addresses slugs by name
    // and has only one name to go on.
    global: globalSlug ? [{ slug: globalSlug, blocks: globalResponse.blocks }] : [],
  };
}
