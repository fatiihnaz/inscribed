/**
 * @file Turns a backend validation `detail` into label-aware admin wording by
 * resolving its field paths against the collection schema. Pure and React-free,
 * like its `record-payload` sibling.
 */

/**
 * @import { CollectionFieldDescriptor } from "../shared/contracts/schemas.js"
 */

/**
 * Turn a backend validation `detail` into a Turkish, label-aware banner. The
 * API reports paths like `works[0].title`; resolve each segment against the
 * schema so the admin reads "Çalışmalar #1 → Başlık". Handles the required and
 * unknown-field shapes, else rewrites any quoted path token to its label chain.
 *
 * @param {string | null | undefined} detail
 * @param {CollectionFieldDescriptor[]} fields
 * @param {import("../shared/i18n/translate.js").Translate} t
 *   Passed in rather than read from a hook, so this stays pure and each shape's
 *   wording is testable without React.
 * @returns {string | null}
 */
export function humanizeCollectionError(detail, fields, t) {
  if (!detail) return null;

  const required = detail.match(/Field '([^']+)' is required/i);
  if (required) return t("collections.requiredMissing", { field: resolveFieldPath(required[1], fields) });

  const unknown = detail.match(/Unknown field '([^']+)'/i);
  if (unknown) return t("collections.unknownField", { field: resolveFieldPath(unknown[1], fields) });

  // Rewrite any quoted path that resolves to a known field, leaving the rest intact.
  const rewritten = detail.replace(/'([^']+)'/g, (whole, path) => {
    const label = resolveFieldPath(path, fields);
    return label === path ? whole : `'${label}'`;
  });
  return t("collections.invalidData", { detail: rewritten });
}

/**
 * Resolve a backend field path (`works[0].title`) to a readable label
 * chain (`Çalışmalar #1 → Başlık`) by walking the schema's `itemFields`.
 * Unknown segments fall back to their raw name; array indices render
 * 1-based to match the editor's per-item headers.
 *
 * @param {string} path
 * @param {CollectionFieldDescriptor[]} fields
 * @returns {string}
 */
function resolveFieldPath(path, fields) {
  /** @type {CollectionFieldDescriptor[] | null} */
  let current = fields;
  const labels = [];
  for (const segment of path.split(".")) {
    const m = segment.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (!m) { labels.push(segment); current = null; continue; }
    const [, name, index] = m;
    const field = current?.find((f) => f.name === name) ?? null;
    let label = field?.label || name;
    if (index != null) label += ` #${Number(index) + 1}`;
    labels.push(label);
    current = field?.itemFields ?? null;
  }
  return labels.join(" → ");
}
