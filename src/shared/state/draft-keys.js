/**
 * @file Queue keys for draft writes. They name the **target endpoint**, not the
 * record, because the queue's job is to keep two writers off one backend slot.
 *
 * Keying by record identity looks natural and is wrong: a virtual row and the
 * composer both POST to `/cms/collections/{key}/drafts`, but the row has a slug
 * and the composer doesn't, so they would land in different lanes and race.
 */

/**
 * One page's block drafts (`PUT /cms/draft`), which are batched per slug.
 *
 * @param {string} slug
 * @returns {string}
 */
export function contentDraftKey(slug) {
  return `content:${slug}`;
}

/**
 * A published record's draft (`PUT /cms/collections/{key}/{slug}/draft`).
 *
 * @param {string} collection
 * @param {string} slug
 * @returns {string}
 */
export function itemDraftKey(collection, slug) {
  return `item:${collection}:${slug}`;
}

/**
 * The collection's single new-item draft slot
 * (`POST /cms/collections/{key}/drafts`). One per collection, no slug: that is
 * what the backend offers, and every surface composing a new record shares it.
 *
 * @param {string} collection
 * @returns {string}
 */
export function newDraftKey(collection) {
  return `new:${collection}`;
}
