/**
 * @file What the collection panel has to work out about a record before it can
 * draw a row: which field headlines it, which columns it can be sorted by, how
 * old it is, and how a `sort` string splits.
 *
 * Pure and React-free, so they are unit-testable without a render and reusable
 * by any surface that lists records.
 */

// Field names that conventionally hold an item's human title, in priority
// order; anything else falls back to the schema's first textual field.
const TITLE_FIELD_NAMES = ["title", "name", "heading", "başlık", "baslik", "ad"];
const TEXTUAL_FIELD_TYPES = new Set(["ShortText", "LongText"]);

/**
 * Name of the field whose value should headline a row, or null when the schema
 * offers nothing textual. Null is a real answer: the caller then shows the slug
 * alone rather than inventing a label.
 *
 * @param {import("../../shared/contracts/schemas.js").CollectionSchema | null | undefined} schema
 * @returns {string | null}
 */
export function titleFieldName(schema) {
  const fields = schema?.fields;
  if (!fields || fields.length === 0) return null;
  for (const wanted of TITLE_FIELD_NAMES) {
    const hit = fields.find((f) => f.name.toLowerCase() === wanted);
    if (hit) return hit.name;
  }
  const textual = fields.find((f) => TEXTUAL_FIELD_TYPES.has(f.type));
  return textual ? textual.name : null;
}

/**
 * Columns `?sort=` accepts for this collection: three the backend always
 * offers, plus whatever the schema marks sortable. Built from the schema rather
 * than hardcoded, because which fields carry an index is per collection.
 *
 * @param {import("../../shared/contracts/schemas.js").CollectionSchema | null | undefined} schema
 * @returns {{ value: string, labelKey?: string, label?: string }[]}
 */
export function sortableColumns(schema) {
  const base = [
    { value: "slug", labelKey: "collections.sortSlug" },
    { value: "createdAt", labelKey: "collections.sortCreatedAt" },
    { value: "updatedAt", labelKey: "collections.sortUpdatedAt" },
  ];
  const own = (schema?.fields ?? [])
    .filter((f) => f.sortable)
    .map((f) => ({ value: f.name, label: f.label || f.name }));
  return [...base, ...own];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact age, for the right edge of a row. Switches to a plain date after a
 * week, where "23d" stops being a span anyone can picture.
 *
 * @param {string | undefined} iso
 * @param {(key: string, vars?: Record<string, *>) => string} t
 * @returns {string | null}
 */
export function shortAge(iso, t) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const elapsed = Date.now() - then;
  // A clock skewed a little ahead of the server would otherwise render "-0m".
  if (elapsed < MINUTE) return t("collections.timeNow");
  if (elapsed < HOUR) return t("collections.timeMinutes", { n: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t("collections.timeHours", { n: Math.floor(elapsed / HOUR) });
  if (elapsed < 7 * DAY) return t("collections.timeDays", { n: Math.floor(elapsed / DAY) });
  return new Date(then).toLocaleDateString();
}

/**
 * Row headline for one item. Reads the draft first: while an item is being
 * edited its draft title is what the user expects to see in the list.
 *
 * @param {import("../../shared/contracts/schemas.js").CollectionItemResponse} item
 * @param {string | null} field
 * @returns {string | null}
 */
export function itemTitle(item, field) {
  if (!field) return null;
  const data = item.draftData ?? item.data;
  const raw = data ? data[field] : undefined;
  if (typeof raw !== "string") return null;
  return raw.trim() || null;
}

/**
 * Name of the field whose image should lead a row, or null when the schema
 * declares none. A record list is a list of content, and the first `Image` the
 * schema carries is the only thing in it that can be seen rather than read.
 *
 * The first one wins rather than a conventional name: unlike a title, an image
 * field is rarely called the same thing twice ("cover", "gorsel", "photo"), and
 * a schema with two of them has no reason to prefer the second.
 *
 * @param {import("../../shared/contracts/schemas.js").CollectionSchema | null | undefined} schema
 * @returns {string | null}
 */
export function imageFieldName(schema) {
  const hit = schema?.fields?.find((f) => f.type === "Image");
  return hit ? hit.name : null;
}

/**
 * A row's thumbnail source. Reads the draft first, same as the headline: an
 * editor who just swapped the image expects the list to show the new one.
 *
 * `Image` values are `{ src, alt }`, so a field that exists but was never
 * filled yields null rather than an empty box the browser would mark broken.
 *
 * @param {import("../../shared/contracts/schemas.js").CollectionItemResponse} item
 * @param {string | null} field
 * @returns {string | null}
 */
export function itemImage(item, field) {
  if (!field) return null;
  const data = item.draftData ?? item.data;
  const raw = data ? data[field] : undefined;
  if (!raw || typeof raw !== "object") return null;
  const src = /** @type {{ src?: unknown }} */ (raw).src;
  return typeof src === "string" && src.trim() ? src : null;
}

/**
 * `"publishedAt:desc"` into its two halves, defaulting the direction the way
 * the backend does.
 *
 * @param {string} sort
 * @returns {[string, "asc" | "desc"]}
 */
export function splitSort(sort) {
  const [column, dir] = sort.split(":");
  return [column, dir === "desc" ? "desc" : "asc"];
}
