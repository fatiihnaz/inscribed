/**
 * @file Turning the site, as the server hands it over, into the store the
 * client renders from. Pure, so the seeding is testable on its own.
 *
 * The globals get one entry of their own rather than being folded into every
 * page. That is the whole shape: a page holds only its own blocks, and a block
 * not found there is looked for in the globals slot. Copying them per page
 * would mean every copy had to be kept in step, and the one that moved first
 * (an autosave mirroring a header edit back onto the route being edited) left
 * every other route holding a stale one.
 */

import { indexBlocksByPath } from "./blocks.js";
import { globalsKey, routeKey } from "../shared/route.js";

/**
 * @import { BlockResponse, SitePageContent } from "../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} SiteContent
 * @property {SitePageContent[]} pages   Routes.
 * @property {SitePageContent[]} global  Everything that is not a route.
 */

/** Nothing read yet, in the shape the seeders take. */
export const EMPTY_SITE = /** @type {SiteContent} */ (Object.freeze({
  pages: Object.freeze([]),
  global: Object.freeze([]),
}));

/**
 * Stamp each block with the slug it came from. That stamp is what lets the save
 * layer PUT a block back to the right place; without it a header edited from a
 * page would save onto that page.
 *
 * @param {SitePageContent[]} entries
 * @returns {BlockResponse[]}
 */
function stamped(entries) {
  /** @type {BlockResponse[]} */
  const out = [];
  for (const entry of entries) {
    for (const block of entry.blocks) out.push({ ...block, _slug: entry.slug });
  }
  return out;
}

/**
 * One store entry per page, plus one for the language's globals.
 *
 * @param {SiteContent | null | undefined} site
 * @param {string|null} locale   The language these blocks are in.
 * @returns {Map<string, Map<string, BlockResponse>>}
 */
export function seedSite(site, locale) {
  /** @type {Map<string, Map<string, BlockResponse>>} */
  const store = new Map();
  if (!site) return store;
  store.set(globalsKey(locale), indexBlocksByPath(stamped(site.global ?? [])));
  for (const page of site.pages ?? []) {
    store.set(routeKey(page.slug, locale), indexBlocksByPath(stamped([page])));
  }
  return store;
}

/**
 * Fold a freshly-read site onto what the store already holds, which is what a
 * re-render of the layout means: a publish regenerated the route, or something
 * called `router.refresh()`.
 *
 * The site the server hands over is the *published* one. It carries no
 * `draftValue`, because the read behind it had no editor's credential, so
 * writing it in flat takes an editor's unpublished work off every surface that
 * counts it: the dirty badge, the changes preview, the save set.
 *
 * So a block keeps the draft the store already had, while the two agree on
 * `version`. A version that moved means the row was published, by this editor
 * or another, and its old draft is either consumed or written against a value
 * that no longer exists. Local edits are untouched either way: they live in
 * `contentDraftsStore`, not here.
 *
 * The editor's own read goes through `seedSite` instead, because it knows about
 * drafts and is therefore the authority on them.
 *
 * @param {Map<string, Map<string, BlockResponse>>} previous
 * @param {SiteContent | null | undefined} site
 * @param {string|null} locale
 * @returns {Map<string, Map<string, BlockResponse>>}
 */
export function reseedSite(previous, site, locale) {
  const next = new Map(previous);
  for (const [key, blocks] of seedSite(site, locale)) {
    next.set(key, carryServerDrafts(previous.get(key), blocks));
  }
  return next;
}

/**
 * @param {Map<string, BlockResponse> | undefined} before
 * @param {Map<string, BlockResponse>} after
 * @returns {Map<string, BlockResponse>}
 */
function carryServerDrafts(before, after) {
  if (!before || before.size === 0) return after;
  /** @type {Map<string, BlockResponse> | null} */
  let carried = null;
  for (const [path, block] of after) {
    const prior = before.get(path);
    if (!prior || prior.draftValue == null) continue;
    if (prior.version !== block.version) continue;
    carried ??= new Map(after);
    carried.set(path, { ...block, draftValue: prior.draftValue });
  }
  return carried ?? after;
}

/**
 * The slugs a site has content for, which is what a pathname is matched
 * against (`matchCmsRoute`). Only routes, so the globals are absent by
 * construction rather than by remembering to skip a name.
 *
 * @param {SiteContent | null | undefined} site
 * @returns {Set<string>}
 */
export function siteSlugs(site) {
  /** @type {Set<string>} */
  const slugs = new Set();
  for (const page of site?.pages ?? []) slugs.add(page.slug);
  return slugs;
}
