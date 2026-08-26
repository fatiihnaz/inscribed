/**
 * @file Pure array ops for List-typed blocks. Shared by `ListEditor` and the
 * in-page `<EditableList>` so both edit a list the exact same way.
 */

/**
 * @import { ItemSchema } from "../contracts/schemas.js"
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
 * Move the item at `from` into the gap at `to`, where `to` is an *insertion
 * slot* (0 is before the first item, `items.length` is after the last) rather
 * than a final index. That is what a drop position naturally is: the pointer
 * sits in a gap, not on a seat.
 *
 * Returns the same array reference when the move is a no-op, so callers can
 * skip the setState.
 *
 * @template T
 * @param {T[]} items
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItemTo(items, from, to) {
  if (from < 0 || from >= items.length) return items;
  const slot = Math.max(0, Math.min(to, items.length));
  // Pulling `from` out first shifts every later slot down one, so a drop past
  // its own position lands one short without this.
  const target = slot > from ? slot - 1 : slot;
  if (target === from) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Move the item at `from` so it ends up at `index`. The counterpart to
 * `moveItemTo` for callers that name a seat rather than a gap: typing "4" into
 * a position field means "be the fourth", not "go into the fourth gap".
 *
 * @template T
 * @param {T[]} items
 * @param {number} from
 * @param {number} index
 * @returns {T[]}
 */
export function moveItemToIndex(items, from, index) {
  if (items.length === 0) return items;
  const seat = Math.max(0, Math.min(index, items.length - 1));
  // Landing past its own seat needs the gap one further along, because the
  // pull-out shifts everything after it down.
  return moveItemTo(items, from, seat >= from ? seat + 1 : seat);
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
// ---------------------------------------------------------------------------
// Index sets
//
// A repeatable editor keeps per-row UI state (which rows are expanded) as a set
// of indices. Every structural op above moves rows around, so the set has to be
// remapped in step or the state ends up on the wrong row. These are the
// counterparts of the moves, and they are pure so the arithmetic can be tested
// on its own.
// ---------------------------------------------------------------------------

/**
 * Remap an index set after the row at `removed` is dropped: forget that index
 * and slide every higher one down by one.
 *
 * @param {Set<number>} set
 * @param {number} removed
 * @returns {Set<number>}
 */
export function dropIndex(set, removed) {
  /** @type {Set<number>} */
  const next = new Set();
  for (const i of set) {
    if (i === removed) continue;
    next.add(i > removed ? i - 1 : i);
  }
  return next;
}

/**
 * Remap an index set the way `moveItemToIndex` remaps the rows themselves: the
 * moved row follows its index, and everything it passes shifts one seat the
 * other way. Reduces to a swap for a neighbouring move, and stays correct for a
 * drag across several rows, which a swap would get wrong.
 *
 * @param {Set<number>} set
 * @param {number} from
 * @param {number} to
 * @returns {Set<number>}
 */
export function moveIndex(set, from, to) {
  if (from === to) return set;
  /** @type {Set<number>} */
  const next = new Set();
  for (const i of set) {
    if (i === from) next.add(to);
    else if (from < to && i > from && i <= to) next.add(i - 1);
    else if (from > to && i >= to && i < from) next.add(i + 1);
    else next.add(i);
  }
  return next;
}
