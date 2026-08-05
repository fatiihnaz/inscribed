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
 * The locale is part of the key because it is part of the endpoint: two
 * languages of one page are two draft slots, and sharing a lane would make
 * editing the English copy cancel the Turkish write still in flight.
 *
 * @param {string} slug
 * @param {string|null} [locale]  Omitted on a single-language site.
 * @returns {string}
 */
export function contentDraftKey(slug, locale) {
  return locale ? `content:${locale}:${slug}` : `content:${slug}`;
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
 * The collection's new-item draft slot
 * (`POST /cms/collections/{key}/drafts`). No slug: that is what the backend
 * offers, and every surface composing a new record shares it.
 *
 * One per collection *per locale*, because the slot itself is: composing a
 * Turkish record and an English one are two drafts, so they must not queue
 * behind (and cancel) each other.
 *
 * @param {string} collection
 * @param {string|null} [locale]  Omitted on a single-language site.
 * @returns {string}
 */
export function newDraftKey(collection, locale) {
  return locale ? `new:${locale}:${collection}` : `new:${collection}`;
}
