/**
 * @file Merging a page's blocks with the global slug's. Shared by the server
 * fetch and the admin-side client refetch, which had grown identical copies:
 * same stamping, same collision rule, same ordering. A change to the merge
 * semantics only lands here now.
 */

/**
 * @import { BlockResponse } from "./schemas.js"
 */

/**
 * Stamp each block with the slug it came from and fold the global blocks in.
 *
 * The `_slug` stamp is what lets the save layer PUT each block back to the
 * right place; without it a header edited from a page would save onto that page.
 *
 * Page wins on a path collision (defensive, it shouldn't happen), and global
 * blocks append at the bottom. The drawer orders each slug group by `sortOrder`
 * afterwards, so the order here only decides the grouping.
 *
 * @param {{
 *   slug: string,
 *   globalSlug: string | null,
 *   pageBlocks: BlockResponse[],
 *   globalBlocks: BlockResponse[],
 * }} input
 * @returns {BlockResponse[]}
 */
export function mergePageBlocks({ slug, globalSlug, pageBlocks, globalBlocks }) {
  const stampedPage = pageBlocks.map((b) => ({ ...b, _slug: slug }));
  if (!globalSlug || globalBlocks.length === 0) return stampedPage;

  /** @type {Set<string>} */
  const pagePaths = new Set(stampedPage.map((b) => b.blockPath));
  const stampedGlobal = globalBlocks
    .filter((b) => !pagePaths.has(b.blockPath))
    .map((b) => ({ ...b, _slug: globalSlug }));

  return [...stampedPage, ...stampedGlobal];
}

/**
 * The global slug worth fetching alongside `slug`, or `null` when there is
 * none or it is the page itself.
 *
 * @param {string | undefined} globalSlug
 * @param {string} slug
 * @returns {string | null}
 */
export function resolveGlobalSlug(globalSlug, slug) {
  return globalSlug && globalSlug !== slug ? globalSlug : null;
}
