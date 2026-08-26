/**
 * @file Reading a value that points at a collection record.
 *
 * The backend sends these as the same `{ slug, label }` pair a lookup returns,
 * so a field can name the record it holds without asking for it. Only the slug
 * is ever written back: the label is the backend's to resolve, and echoing a
 * stale one would let the display drift from what is stored.
 *
 * Both readers tolerate a bare slug string and a pair whose label is missing.
 * That is deliberate rather than defensive: someone pointing the SDK at their
 * own backend should get a slug on screen, not a crash, while they are still
 * wiring it up.
 */

/**
 * @typedef {string | { slug?: string, label?: string } | null | undefined} ChoiceValue
 */

/**
 * What gets stored and sent.
 *
 * @param {ChoiceValue} value
 * @returns {string}
 */
export function choiceSlug(value) {
  if (value && typeof value === "object") return value.slug ?? "";
  return value ?? "";
}

/**
 * What the editor reads. Falls back to the slug, which is a poor name but a
 * true one.
 *
 * @param {ChoiceValue} value
 * @returns {string}
 */
export function choiceLabel(value) {
  if (value && typeof value === "object") return value.label || value.slug || "";
  return value ?? "";
}
