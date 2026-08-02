/**
 * @file Structural equality for JSON-safe block values, the comparison behind
 * every dirty check (draft vs published).
 *
 * Replaces `stableStringify(a) === stableStringify(b)` on those paths: the
 * checks run per render and per keystroke, and serialising both sides means
 * building two strings the size of the content just to throw them away. A
 * RichText block is the worst case and the most common one.
 *
 * `stableStringify` stays for what it is actually for: deriving cache keys.
 */

/**
 * Same key-order insensitivity as `stableStringify`, so the two agree on
 * `{src,alt}` vs `{alt,src}`. Inputs are JSON-safe, so no Map/Set/Date
 * handling; `NaN` compares unequal here (`stableStringify` folds it to `null`),
 * which block values never carry.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    // An explicit `undefined` and a missing key are different values, matching
    // how `stableStringify` renders them.
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}
