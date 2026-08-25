/**
 * @file Display-string helpers shared by the repeatable editors: what to call
 * one element of a list, and what to show on its collapsed header.
 */

/**
 * @import { CollectionFieldDescriptor } from "../contracts/schemas.js"
 */

/**
 * Strip a Turkish plural suffix (`-lar`/`-ler`) so an add button reads "Çalışma
 * ekle" not "Çalışmalar ekle". A stem-length floor leaves short words that
 * merely end in those letters (e.g. "Sular") intact.
 *
 * @param {string} label
 * @returns {string}
 */
export function singularize(label) {
  const trimmed = String(label).trim();
  const m = /^(.+)(lar|ler)$/i.exec(trimmed);
  return m && m[1].length >= 3 ? m[1] : trimmed;
}

/**
 * The first entry holding a non-empty string, RichText stripped of its tags.
 * Shared by the two collapsed-card headers so they agree on what "the first
 * usable text" means; they disagree on which fields are eligible, so each
 * caller does its own filtering before handing entries over.
 *
 * @param {{ value: *, type: string }[]} entries  In the order to consider them.
 * @returns {string | null}
 */
export function firstNonEmptyText(entries) {
  for (const { value, type } of entries) {
    if (typeof value !== "string") continue;
    const text = (type === "RichText" ? value.replace(/<[^>]*>/g, " ") : value).trim();
    if (text) return text;
  }
  return null;
}

/**
 * One-line summary for a collapsed ObjectArray card, so the header reads like
 * the item instead of a bare index. Every field is eligible: whatever holds a
 * string can name the row, including a Url or a Date.
 *
 * @param {CollectionFieldDescriptor[]} itemFields
 * @param {Record<string, *> | undefined} item
 * @returns {string | null}
 */
export function itemSummary(itemFields, item) {
  if (!item) return null;
  return firstNonEmptyText(itemFields.map((f) => ({ value: item[f.name], type: f.type })));
}
