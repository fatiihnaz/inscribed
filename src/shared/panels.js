/**
 * @file Validation for the `panels` option: the admin areas an app injects into
 * the drawer beside Page and Collections.
 *
 * Shared by `createCmsPage` and `CmsProvider` because either can be the wiring
 * point, and a malformed descriptor should be named where it was written rather
 * than surface as a rail button that opens nothing.
 *
 * No React or style imports: this runs in a server module and a client one.
 */

/**
 * @typedef {Object} CmsPanel
 * @property {string} id
 *   Stable identifier, unique across the list. Also the drawer's mode value,
 *   so `"page"` and `"collections"` are taken.
 * @property {string} [label]
 *   The area's name, printed as written. For a single-language panel.
 * @property {string} [labelKey]
 *   An admin-string key resolved through the panel catalog instead, so the name
 *   follows `adminLocale` / `adminStrings` like the rest of the drawer's
 *   wording. Exactly one of `label` / `labelKey`.
 * @property {*} Component
 *   The area's body: a client component, rendered inside the drawer. It reads
 *   its own API from `useCmsPanel()` (`inscribed/panels`).
 * @property {React.ReactNode} [icon]
 *   Rail glyph, drawn into a 17px box. Defaults to a neutral one.
 * @property {string} [accent]
 *   CSS colour for the rail's active state, the header badge and the panel's
 *   own badge. Defaults to the theme accent.
 */

/** Rail modes the drawer owns; a panel may not take their names. */
const RESERVED_IDS = new Set(["page", "collections"]);

/**
 * @param {CmsPanel[] | null | undefined} panels
 * @returns {readonly CmsPanel[] | null}
 *   Null when none were given, so "no panels" stays one check rather than an
 *   empty-array special case at every use site.
 */
export function normalizePanels(panels) {
  if (panels == null) return null;
  if (!Array.isArray(panels)) {
    throw new Error("panels: must be an array of panel descriptors");
  }
  if (panels.length === 0) return null;

  /** @type {Set<string>} */
  const seen = new Set();
  panels.forEach((panel, i) => {
    const at = `panels[${i}]`;
    if (panel == null || typeof panel !== "object") {
      throw new Error(`${at}: must be an object`);
    }
    if (typeof panel.id !== "string" || panel.id === "") {
      throw new Error(`${at}: \`id\` is required and must be a non-empty string`);
    }
    if (RESERVED_IDS.has(panel.id)) {
      throw new Error(
        `${at}: "${panel.id}" is one of the drawer's own areas; pick another \`id\``,
      );
    }
    if (seen.has(panel.id)) {
      throw new Error(`${at}: duplicate \`id\` "${panel.id}"`);
    }
    seen.add(panel.id);
    // Not a function check: a client component arrives here as an opaque
    // reference object, so "present" is as much as this can know.
    if (panel.Component == null) {
      throw new Error(`${at}: \`Component\` is required`);
    }
    const hasLabel = typeof panel.label === "string" && panel.label !== "";
    const hasLabelKey = typeof panel.labelKey === "string" && panel.labelKey !== "";
    if (hasLabel === hasLabelKey) {
      throw new Error(
        `${at}: pass exactly one of \`label\` (printed as written) or ` +
          "`labelKey` (resolved through adminStrings)",
      );
    }
  });

  return Object.freeze([...panels]);
}
