/**
 * @file Which things carry unpublished changes. Two shapes, because content
 * blocks and collection records answer the question from different sources:
 * a block compares its draft against its own published value, while a record's
 * draft lives in a shared overlay map beside a cache entry.
 *
 * Both were written out at four to five call sites each (rail dots, tab dots,
 * preview counts, the save set), which is how the drawer's `dirtyCount` and
 * `previewableCount` came to disagree.
 */

import { isBlockDirty } from "../core/resolve.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 * @import { CollectionItemCacheEntry } from "../collections/context.js"
 */

/**
 * Dirty flag per blockPath, for the surfaces that aggregate (rail dots, tab
 * dots, preview counts).
 *
 * @param {Map<string, BlockResponse>} blocks
 * @param {Map<string, *>} drafts
 * @returns {Map<string, boolean>}
 */
export function collectDirtyBlocks(blocks, drafts) {
  /** @type {Map<string, boolean>} */
  const dirty = new Map();
  for (const block of blocks.values()) {
    const path = block.blockPath;
    dirty.set(path, isBlockDirty(block, drafts.has(path), drafts.get(path)));
  }
  return dirty;
}

/**
 * Records carrying an unpublished change, keyed `"{key}:{slug}"`.
 *
 * Unions two sources on purpose: the live overlay clears as soon as autosave
 * lands, and reading it alone would drop the mark off a record whose draft is
 * sitting on the server, unpublished.
 *
 * @param {Map<string, *>} drafts
 * @param {Map<string, CollectionItemCacheEntry>} itemCache
 * @returns {Set<string>}
 */
export function collectDirtyRecords(drafts, itemCache) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const key of drafts.keys()) set.add(key);
  for (const [key, entry] of itemCache) {
    if (entry.item && entry.item.draftData != null) set.add(key);
  }
  return set;
}

/**
 * Project dirty record keys onto the collections they belong to.
 *
 * @param {Set<string>} dirtyRecords
 * @returns {Set<string>}
 */
export function dirtyCollectionKeys(dirtyRecords) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const key of dirtyRecords) {
    const i = key.indexOf(":");
    if (i > 0) set.add(key.slice(0, i));
  }
  return set;
}

/**
 * Project dirty record keys onto the slugs of one collection.
 *
 * @param {Set<string>} dirtyRecords
 * @param {string} collectionKey
 * @returns {Set<string>}
 */
export function dirtySlugsFor(dirtyRecords, collectionKey) {
  const prefix = `${collectionKey}:`;
  /** @type {Set<string>} */
  const set = new Set();
  for (const key of dirtyRecords) {
    if (key.startsWith(prefix)) set.add(key.slice(prefix.length));
  }
  return set;
}
