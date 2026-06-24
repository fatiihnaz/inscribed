/**
 * @file JSON stringify with sorted keys, so `{src,alt}` and `{alt,src}`
 * compare equal. Drives dirty-detection (draft vs published). Inputs are
 * always JSON-safe block values, so no Map/Set/Date handling.
 */

/** @param {*} value */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}