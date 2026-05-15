/**
 * @file Pure helpers for List-typed block mutations.
 *
 * Shared between the drawer's `ListEditor` (form-style per-item field
 * editor) and the in-page `<EditableList>` overlay (inline admin
 * controls). Both surfaces talk to the same blockPath/draft so the
 * underlying array operations must be identical - kept here as pure
 * functions to avoid drift.
 */

/**
 * @import { ItemSchema } from "./schemas.js"
 */

/**
 * Build a fresh item object using the schema's `defaultValue`s. Each
 * non-null default is deep-cloned via JSON so two new items don't share
 * references that a later edit would mutate in place.
 *
 * @param {ItemSchema | null | undefined} itemSchema
 * @returns {Record<string, *>}
 */
export function makeDefaultItem(itemSchema) {
  /** @type {Record<string, *>} */
  const out = {};
  for (const [key, field] of Object.entries(itemSchema ?? {})) {
    out[key] = field.defaultValue == null
      ? field.defaultValue
      : JSON.parse(JSON.stringify(field.defaultValue));
  }
  return out;
}

/**
 * Swap the item at `index` with its neighbour in `dir` direction. Returns
 * the original array (referentially equal) when the move would go
 * out-of-bounds so callers can detect a no-op and skip the setState.
 *
 * @template T
 * @param {T[]} items
 * @param {number} index
 * @param {-1 | 1} dir
 * @returns {T[]}
 */
export function moveItem(items, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= items.length) return items;
  const next = items.slice();
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/**
 * Return a new array with the item at `index` removed.
 *
 * @template T
 * @param {T[]} items
 * @param {number} index
 * @returns {T[]}
 */
export function removeItem(items, index) {
  return items.filter((_, idx) => idx !== index);
}

/**
 * Return a new array with a fresh schema-defaulted item appended.
 *
 * @param {Record<string, *>[]} items
 * @param {ItemSchema} itemSchema
 * @returns {Record<string, *>[]}
 */
export function addItem(items, itemSchema) {
  return [...items, makeDefaultItem(itemSchema)];
}