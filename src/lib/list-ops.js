/**
 * @file Pure array ops for List-typed blocks. Shared by `ListEditor` and the
 * in-page `<EditableList>` so both edit a list the exact same way.
 */

/**
 * @import { ItemSchema } from "./schemas.js"
 */

/**
 * Build a fresh item from the schema's `defaultValue`s. Defaults are
 * deep-cloned so two new items never share a mutable reference.
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
 * Swap the item at `index` with its neighbour in `dir`. Returns the same
 * array reference on an out-of-bounds move so callers can skip the setState.
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