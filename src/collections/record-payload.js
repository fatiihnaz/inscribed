/**
 * @file The seed -> payload -> validate pipeline for a collection record's
 * form values. Pure and React-free, so the collection hooks and their tests can
 * use it without pulling the form's component tree.
 */

/**
 * @import { CollectionFieldDescriptor } from "../shared/contracts/schemas.js"
 */

/**
 * Build the initial values map for a form, falling back to per-type
 * defaults for fields missing from `data`. Use on mount to seed form
 * state from an existing item, or with `data = {}` for a fresh "create"
 * form.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} data
 * @returns {Record<string, *>}
 */
export function seedValues(fields, data) {
  /** @type {Record<string, *>} */
  const out = {};
  for (const field of fields) {
    // ObjectArray: seed each element through its own itemFields so a
    // partially-filled item still gains defaults for missing inner keys.
    if (field.type === "ObjectArray") {
      const arr = Array.isArray(data[field.name]) ? data[field.name] : [];
      out[field.name] = arr.map((item) => seedValues(field.itemFields ?? [], item ?? {}));
      continue;
    }
    if (field.name in data) {
      out[field.name] = data[field.name];
      continue;
    }
    out[field.name] = defaultFor(field.type);
  }
  return out;
}

/** @param {import("../shared/contracts/schemas.js").CollectionFieldType} type */
function defaultFor(type) {
  switch (type) {
    case "Bool":        return false;
    case "Number":      return null;
    case "StringArray": return [];
    case "ObjectArray": return [];
    case "Image":       return { src: "", alt: "" };
    case "Link":        return { href: "", label: "" };
    default:            return "";
  }
}

/**
 * Shape a form's `values` into the request body's `data` payload.
 * Strips readOnly and computed fields - the backend ignores them anyway but
 * keeping the wire payload clean helps debugging.
 *
 * Empty goes on the wire as `null`, not `""`: the form uses the empty string
 * because that is what a controlled input holds when nothing is typed or
 * picked, but stored as-is it reads like a value the editor chose. An unset
 * date or select is the clearest case, since `""` is not a date or an option.
 *
 * Two things stay as they are. An empty array is a value ("no tags"), not an
 * absent one, and an `Image` keeps its `{ src, alt }` shape whenever `src` is
 * set, since the backend rejects a half-filled one.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} values
 * @returns {Record<string, *>}
 */
export function buildPayload(fields, values) {
  /** @type {Record<string, *>} */
  const out = {};
  for (const field of fields) {
    if (field.readOnly || field.computed) continue;
    // ObjectArray: shape each element through its itemFields so inner
    // readOnly keys are stripped per item, mirroring the top-level pass.
    if (field.type === "ObjectArray") {
      const items = Array.isArray(values[field.name]) ? values[field.name] : [];
      out[field.name] = items.map((item) => buildPayload(field.itemFields ?? [], item ?? {}));
      continue;
    }
    // Both compound scalars go on the wire whole or not at all: a half-filled
    // one is neither a value nor an absence, and the backend rejects it.
    if (field.type === "Image") {
      const image = values[field.name];
      out[field.name] = image?.src ? image : null;
      continue;
    }
    if (field.type === "Link") {
      const link = values[field.name];
      out[field.name] = link?.href ? link : null;
      continue;
    }
    const value = values[field.name];
    out[field.name] = value === "" ? null : value;
  }
  return out;
}

/**
 * Returns the label/name of the first required field that's missing a
 * value, or `null` if everything required is present. Lets the caller
 * surface a precise message without re-walking the schema.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} values
 * @returns {string | null}
 */
export function requiredMissing(fields, values) {
  for (const field of fields) {
    if (field.readOnly || field.computed) continue;

    const value = values[field.name];

    // ObjectArray validates each item's inner required fields even when the
    // array is optional; a required array must also be non-empty. Draft
    // autosave never calls this, so inner requireds are enforced only on save.
    if (field.type === "ObjectArray") {
      const items = Array.isArray(value) ? value : [];
      if (field.required && items.length === 0) return field.label || field.name;
      for (let i = 0; i < items.length; i++) {
        const innerMissing = requiredMissing(field.itemFields ?? [], items[i] ?? {});
        if (innerMissing) return `${field.label || field.name} #${i + 1} → ${innerMissing}`;
      }
      continue;
    }

    // Image is `{ src, alt }`, both required whenever the field has a value.
    // Runs before the `!required` skip: even an optional image must carry alt
    // once src is set, else the backend 400s.
    if (field.type === "Image") {
      const v = value && typeof value === "object" ? value : {};
      const s = typeof v.src === "string" ? v.src.trim() : "";
      const a = typeof v.alt === "string" ? v.alt.trim() : "";
      if (!s) {
        if (field.required) return field.label || field.name;
        continue;
      }
      if (!a) return `${field.label || field.name} → Alt`;
      continue;
    }

    if (!field.required) continue;

    if (field.type === "StringArray") {
      if (!Array.isArray(value) || value.length === 0) return field.label || field.name;
    } else if (field.type === "Bool") {
      // `required` is semantically odd for booleans; `false` is a valid value.
      continue;
    } else if (field.type === "Number") {
      if (value === null || value === undefined || Number.isNaN(value)) return field.label || field.name;
    } else if (value === null || value === undefined || String(value).trim() === "") {
      return field.label || field.name;
    }
  }
  return null;
}
