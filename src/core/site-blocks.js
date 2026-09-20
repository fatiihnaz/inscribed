/**
 * @file Turning the site's pages, as the server hands them over, into the
 * store the client renders from. Pure, so the seeding is testable on its own.
 */

import { indexBlocksByPath } from "./blocks.js";
import { mergePageBlocks, resolveGlobalSlug } from "./merge-blocks.js";
import { routeKey } from "../shared/route.js";

/**
 * @import { BlockResponse, SitePageContent } from "../shared/contracts/schemas.js"
 * @import { CmsConfig } from "../shared/config.js"
 */

/**
 * One store entry per page, each with the global slug's blocks folded in and
 * every block stamped with the slug it saves back to. The global slug itself
 * gets no entry: it is not a route, and nothing renders it on its own.
 *
 * @param {SitePageContent[] | undefined | null} pages
 * @param {string|null} locale   The language these pages are in.
 * @param {Pick<CmsConfig, "globalSlug">} config
 * @returns {Map<string, Map<string, BlockResponse>>}
 */
export function seedSitePages(pages, locale, config) {
  /** @type {Map<string, Map<string, BlockResponse>>} */
  const store = new Map();
  if (!pages) return store;
  const globalBlocks = pages.find((p) => p.slug === config.globalSlug)?.blocks ?? [];
  for (const page of pages) {
    if (page.slug === config.globalSlug) continue;
    const merged = mergePageBlocks({
      slug: page.slug,
      globalSlug: resolveGlobalSlug(config.globalSlug, page.slug),
      pageBlocks: page.blocks,
      globalBlocks,
    });
    store.set(routeKey(page.slug, locale), indexBlocksByPath(merged));
  }
  return store;
}

/**
 * The slugs a site has content for, which is what a pathname is matched
 * against (`matchCmsRoute`). The global slug is left out for the same reason
 * it gets no store entry.
 *
 * @param {SitePageContent[] | undefined | null} pages
 * @param {Pick<CmsConfig, "globalSlug">} config
 * @returns {Set<string>}
 */
export function siteSlugs(pages, config) {
  /** @type {Set<string>} */
  const slugs = new Set();
  for (const page of pages ?? []) {
    if (page.slug !== config.globalSlug) slugs.add(page.slug);
  }
  return slugs;
}
