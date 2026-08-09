/**
 * @file One route's blocks: the page fetch, the global-slug fetch beside it, and
 * the merge. Extracted because two callers need the identical thing for two
 * different routes: `useCmsContent` for the one being rendered, and the
 * translation panel for the same page in another language.
 *
 * The global slug is fetched in the route's own locale. A Turkish page showing
 * an English header would be worse than no header at all.
 */

import { mergePageBlocks, resolveGlobalSlug } from "./merge-blocks.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 * @import { CmsConfig } from "../shared/config.js"
 */

/**
 * @param {{
 *   config: CmsConfig,
 *   slug: string,
 *   locale?: string | null,
 *   accessToken?: string | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<BlockResponse[]>}  Merged and `_slug`-stamped.
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

  return mergePageBlocks({
    slug,
    globalSlug,
    pageBlocks: pageResponse.blocks,
    globalBlocks: globalResponse.blocks,
  });
}
