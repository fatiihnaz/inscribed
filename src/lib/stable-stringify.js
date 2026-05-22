/**
 * @file Stable JSON stringify - sorts object keys recursively before
 * serialising so two semantically-equal payloads (e.g. `{src,alt}` vs
 * `{alt,src}` produced by different editors) compare equal.
 *
 * Used by the autosave path and by dirty-detection to decide whether a
 * draft differs from the published value. Inputs are always JSON-safe
 * block values (round-trip through PUT requests), so we don't try to
 * handle Map/Set/Date/function — those would already break the wire format.
 */

/** @param {*} value */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}