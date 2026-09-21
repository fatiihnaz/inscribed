/**
 * @file One route's blocks, read page by page: the page fetch and the global
 * slug's beside it.
 *
 * The fallback path. A backend that answers the whole-site read is read through
 * `fetchSiteBlocks` instead, in one request. This is for the two cases that
 * still need a single route: a backend without that endpoint, and the
 * translation panel, which wants one page in a language nobody is reading.
 *
 * The global slug is fetched in the route's own locale. A Turkish page showing
 * an English header would be worse than no header at all.
 *
 * Returns the same `{ pages, global }` shape as the whole-site read, so both
 * seed the store through one function.
 */

import { resolveGlobalSlug } from "./merge-blocks.js";

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { SiteContent } from "./site-blocks.js"
 */

/**
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
  const globalSlug = resolveGlobalSlug(config.globalSlug, slug);
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
