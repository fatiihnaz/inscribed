/**
 * @file Theme override layer. The admin UI is styled with `--ins-*` CSS custom
 * properties, each written as `var(--ins-x, <default>)` in
 * `admin-drawer-styles.js`, with soft/line/ramp variants derived via
 * `color-mix`. So overriding one base cascades to every tint built on it.
 *
 * Consumers override a stable subset via `createCmsConfig({ theme })`.
 * `normalizeTheme` keeps only known keys; `buildThemeCss` turns the result
 * into the `:root { … }` block `CmsProvider` emits. Unset keys fall back to the
 * baked defaults, so emitting nothing ships the stock palette.
 *
 * No DOM/React deps: this rides inside the serializable config across the RSC
 * boundary, so it must run in either environment.
 */

/**
 * Public theme key -> CSS custom property name. The single source of truth
 * for which knobs are overridable; `admin-drawer-styles.js` references these
 * same property names by hand in its `var(...)` defaults.
 *
 * @type {Record<string, string>}
 */
const THEME_VARS = {
  // Base colours. Soft/line variants derive from these via color-mix.
  accent:           "--ins-accent",
  collectionAccent: "--ins-collection",
  danger:           "--ins-danger",
  // Neutral system bases. `bg` is the warm-dark panel base (raised/sunken
  // shades derive from it); `surface` (elevation overlay) and `text`
  // (foreground) both default to white, so the white-alpha ramps resolve to
  // their current values until overridden.
  bg:               "--ins-bg",
  surface:          "--ins-surface",
  text:             "--ins-text",
  // Shape + type.
  radius:           "--ins-radius",
  fontSans:         "--ins-font-sans",
  fontMono:         "--ins-font-mono",
};

/** Keys whose numeric values are emitted as `px`. */
const PX_KEYS = new Set(["radius"]);

/**
 * @typedef {Object} CmsTheme
 * @property {string} [accent]            Primary brand accent (default `#c9b896`). Drives dirty rails, focus, primary affordances, and their soft/line tints.
 * @property {string} [collectionAccent]  Accent for Collection surfaces (default `rgb(220,195,225)`).
 * @property {string} [danger]            Destructive / error accent (default `rgb(232,132,152)`).
 * @property {string} [bg]                Warm-dark panel base (default `#1c1815`); raised/sunken shades derive from it.
 * @property {string} [surface]           Elevation-overlay base (default `#ffffff`); surface/border alphas mix from it.
 * @property {string} [text]              Foreground base (default `#ffffff`); the text ramp mixes from it.
 * @property {number|string} [radius]     Corner radius for cards/panels. Number is treated as `px` (default `10`).
 * @property {string} [fontSans]          Sans font stack for UI text.
 * @property {string} [fontMono]          Mono font stack for labels/metadata.
 */

/**
 * Keep only recognized theme keys with usable values. Unknown keys are
 * dropped; `null`/`undefined`/empty values are skipped so they fall back to
 * the baked default rather than emitting an empty custom property.
 *
 * @param {CmsTheme|null|undefined} theme
 * @returns {CmsTheme|null} Frozen subset, or null when nothing usable remains.
 */
export function normalizeTheme(theme) {
  if (!theme || typeof theme !== "object") return null;

  /** @type {CmsTheme} */
  const out = {};
  for (const key of Object.keys(THEME_VARS)) {
    const value = /** @type {Record<string, unknown>} */ (theme)[key];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`createCmsConfig: theme.${key} must be a string or number`);
    }
    out[key] = value;
  }

  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * Turn a normalized theme into a `:root { --ins-*: … }` CSS string. Returns
 * an empty string when there is nothing to override, so callers can render
 * `<style>{buildThemeCss(theme)}</style>` unconditionally.
 *
 * @param {CmsTheme|null|undefined} theme
 * @returns {string}
 */
export function buildThemeCss(theme) {
  const normalized = normalizeTheme(theme);
  if (!normalized) return "";

  const decls = Object.entries(normalized).map(([key, value]) => {
    const prop = THEME_VARS[key];
    const out = PX_KEYS.has(key) && typeof value === "number" ? `${value}px` : value;
    return `${prop}:${out};`;
  });

  return `:root{${decls.join("")}}`;
}
