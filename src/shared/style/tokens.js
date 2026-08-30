/**
 * @file Design tokens for the admin UI: geometry, motion, the type ramp, the
 * colour palette, and block-type badge metadata. Values only, no style
 * objects, so the page-side surfaces (EditableRegion, CmsGroup,
 * CollectionItem) can share the drawer's vocabulary without importing the
 * drawer itself. Its style objects and inline CSS live in
 * `admin/drawer-styles.js`.
 *
 * Refined direction:
 *
 *   - 4px spacing grid; sans carries labels, prose, and (with tabular figures)
 *     numbers, while mono is reserved for literal identifiers
 *   - explicit type ramp (textHi / text / textMid / textMuted / textFaint)
 *   - block-type glyph badges replace the dekoratif grip
 *   - draft accent (sage) on dirty, collection accent (pink-purple) on
 *     Collection lanes
 *
 * Old token names (BORDER_SOFT, TEXT_MUTED, etc.) are kept as aliases
 * so the editor/field surfaces that consume them stay valid while the
 * card-level visuals migrate.
 */

// ---------------------------------------------------------------------------
// Geometry + motion
// ---------------------------------------------------------------------------

export const PANEL_WIDTH = 460;
export const HANDLE_WIDTH = 22;
export const HANDLE_OVERLAP = 4;
// The mode rail lives inside PANEL_WIDTH rather than widening the panel, so the
// drawer keeps the same screen footprint and the pane gets the remainder.
export const RAIL_WIDTH = 48;
// Rounding on the rail's inner edge, where it meets the pane. The pane's fill
// shows through the cut corners, so the rail reads as a dark column the content
// area wraps around.
export const RAIL_EDGE_RADIUS = 14;

// CSS-side read of the width above.
export const PANEL_W = `var(--ins-panel-w, ${PANEL_WIDTH}px)`;

// One shell at every size: a full-height column against the left edge. Only its
// width changes, so there is no second layout to keep working and nothing here
// the stylesheets cannot say on their own.
export const BP_NARROW = 1240;
export const BP_MOBILE = 768;

export const PANEL_WIDTH_NARROW = 360;

// The part of the handle left outside the panel, which is the strip of screen
// the panel has to give up for it. A percentage, not `100vw`: the panel is
// fixed, so this resolves against the viewport without counting a classic
// scrollbar's width.
export const PANEL_HANDLE_REACH = HANDLE_WIDTH - HANDLE_OVERLAP;
export const PANEL_WIDTH_MOBILE = `calc(100% - ${PANEL_HANDLE_REACH}px)`;

// Banded rather than cascading, so neither depends on which rule is written
// first.
export const NARROW_QUERY = `(min-width: ${BP_MOBILE}px) and (max-width: ${BP_NARROW - 1}px)`;
export const MOBILE_QUERY = `(max-width: ${BP_MOBILE - 1}px)`;
// Both bands at once, for what they answer the same way: below the wide shell
// the panel is short of width either way.
export const COMPACT_QUERY = `(max-width: ${BP_NARROW - 1}px)`;

// Framer wants the control points, CSS wants the function; `EASE` below builds
// the string from these.
const CURVE = [0.32, 0.72, 0.18, 1];

// Shared with the page shell that moves out of the panel's way: drift between
// the two reads as the page lagging the drawer.
const PANEL_MS = 350;
export const DUR_PANEL = `${PANEL_MS}ms`;
export const PANEL_TRANSITION = {
  type: "tween",
  duration: PANEL_MS / 1000,
  ease: CURVE,
};

// Corner radius of the page-side edit rings (EditableRegion + CollectionItem),
// so both highlight shapes stay identical.
export const RING_RADIUS = 12;

export const RADIUS = "var(--ins-radius, 10px)";
export const RADIUS_SM = "calc(var(--ins-radius, 10px) - 3px)";

// ---------------------------------------------------------------------------
// Design scale: internal, NOT themeable.
//
// These define the product's *shape* (corner steps, type ramp, motion), not its
// palette, so they stay out of the `theme` subset (which only recolors) and
// every surface snaps to the same vocabulary. The themeable RADIUS / RADIUS_SM
// above are the exception: hosts may legitimately want rounder/squarer cards.
// ---------------------------------------------------------------------------

// Radius steps for the inner chrome (badges, inputs, buttons, chips).
export const R_BADGE = 4;   // tiny tags / index badges
export const R_SM    = 6;   // inputs, dense controls
export const R_BTN   = 7;   // buttons
export const R_MD    = 8;   // single-field editors, nested cards
export const R_PILL  = 99;  // count chips, status pills

/**
 * Every type size in the admin UI goes through this, so the whole ramp moves
 * together on one multiplier. A phone sets `--ins-fs-scale` (see `layout-css`):
 * the desktop steps are dense-chrome sizes, and iOS zooms the page whenever a
 * focused control's text lands under 16px, which every one of them does.
 *
 * @param {number} px  The size at the desktop scale.
 */
export const dynamicSize = (px) => `calc(${px}px * var(--ins-fs-scale, 1))`;

// Type ramp. One step per role: labels, metadata, body, headings.
export const FS_MICRO = dynamicSize(9);   // uppercase micro-labels / mode chips
export const FS_2XS   = dynamicSize(10);  // section labels
export const FS_XS    = dynamicSize(11);  // metadata, hints
export const FS_SM    = dynamicSize(12);  // default UI text / buttons
export const FS_MD    = dynamicSize(12);  // field input text

// Enough to carry FS_MD past the 16px iOS wants; the rest of the ramp follows.
export const FS_SCALE_MOBILE = 1.35;

// Motion. One fast step for hovers/color swaps, one base step for layout.
export const DUR_FAST = "140ms";
export const DUR_BASE = "200ms";
export const EASE = `cubic-bezier(${CURVE.join(", ")})`;

// ---------------------------------------------------------------------------
// Tokens
//
// Every token resolves through a `--ins-*` CSS variable with the stock value
// baked in as the fallback, so the panel looks identical with no theme set.
// `createCmsConfig({ theme })` overrides a small subset of *bases*
// (--ins-accent, --ins-bg, --ins-surface, --ins-text, --ins-collection,
// --ins-danger, --ins-radius, fonts); the soft/line/ramp variants below are
// derived from those bases with `color-mix`, so overriding one base cascades
// to every tint built on it. See `theme.js`.
// ---------------------------------------------------------------------------

// Surfaces. `--ins-bg` is the warm-dark base; raised/sunken shift from it so
// a custom bg carries the elevation shades along.
export const BG          = "var(--ins-bg, #1c1815)";
// The rail sits a full step below the pane so the two areas read as different
// planes, not one surface with a divider.
export const BG_RAIL     = "color-mix(in srgb, var(--ins-bg, #1c1815), #000 22%)";
export const BG_RAISED   = "color-mix(in srgb, var(--ins-bg, #1c1815), #fff 5%)";
export const BG_SUNKEN   = "color-mix(in srgb, var(--ins-bg, #1c1815), #000 6%)";

// Elevation overlays + borders mix from `--ins-surface` (default white), so
// they keep resolving to the original white-alpha values until overridden.
export const SURFACE_1   = "color-mix(in srgb, var(--ins-surface, #fff) 2.5%, transparent)";
export const SURFACE_2   = "color-mix(in srgb, var(--ins-surface, #fff) 5%, transparent)";
export const SURFACE_3   = "color-mix(in srgb, var(--ins-surface, #fff) 8%, transparent)";
export const HAIRLINE    = "color-mix(in srgb, var(--ins-surface, #fff) 6%, transparent)";
export const BORDER      = "color-mix(in srgb, var(--ins-surface, #fff) 10%, transparent)";
export const BORDER_HI   = "color-mix(in srgb, var(--ins-surface, #fff) 18%, transparent)";
export const BORDER_FOCUS= "color-mix(in srgb, var(--ins-surface, #fff) 30%, transparent)";

// Text ramp mixes from `--ins-text` (default white).
export const TEXT_HI       = "color-mix(in srgb, var(--ins-text, #fff) 96%, transparent)";
export const TEXT          = "color-mix(in srgb, var(--ins-text, #fff) 82%, transparent)";
export const TEXT_MID      = "color-mix(in srgb, var(--ins-text, #fff) 58%, transparent)";
export const TEXT_MUTED    = "color-mix(in srgb, var(--ins-text, #fff) 38%, transparent)";
export const TEXT_FAINT    = "color-mix(in srgb, var(--ins-text, #fff) 22%, transparent)";

// Accents. Soft/line tints derive from the base accent vars.
export const ACCENT        = "var(--ins-accent, #c9b896)";
export const ACCENT_SOFT   = "color-mix(in srgb, var(--ins-accent, #c9b896) 14%, transparent)";
export const ACCENT_LINE   = "color-mix(in srgb, var(--ins-accent, #c9b896) 30%, transparent)";

// Applied as an `outline`, so it stacks over a control's own inset-shadow border.
export const FOCUS_RING = "color-mix(in srgb, var(--ins-accent, #c9b896) 65%, transparent)";

// Mid-grey base for surfaces that render on both the dark pane and a light host
// page, where the white-alpha ramps above would vanish. Its ramp is open-ended
// (the collection form alone reaches for a dozen steps), so it is a helper
// rather than a fixed set of constants.
export const NEUTRAL = "var(--ins-neutral, rgb(127, 127, 127))";

/** @param {number} pct */
export const neutralTint = (pct) => `color-mix(in srgb, ${NEUTRAL} ${pct}%, transparent)`;

// Outward reach of a block-level EditableRegion's halo, on every side. Painted
// (outline + shadow spread), never padding, so it costs no layout. A CmsGroup
// outline must clear it to actually enclose its children.
//
// Keep it under half the chip's height (10px): the chip straddles the halo's
// top line, so a larger inset leaves a gap between chip and content that the
// pointer can fall through, dropping hover and taking the chip with it.
export const ROOMY_INSET   = 8;

export const COLLECTION_ACCENT = "var(--ins-collection, rgb(220, 195, 225))";
export const COLLECTION_SOFT   = "color-mix(in srgb, var(--ins-collection, rgb(220,195,225)) 10%, transparent)";
export const COLLECTION_LINE   = "color-mix(in srgb, var(--ins-collection, rgb(220,195,225)) 30%, transparent)";

// Status. Danger is themeable; ok/warn stay fixed (semantic, rarely rebranded).
export const STATUS_OK     = "rgb(150, 210, 160)";
export const STATUS_WARN   = "rgb(232, 192, 130)";
export const STATUS_DANGER = "var(--ins-danger, rgb(232, 132, 152))";
// Typography
export const FONT_SANS = 'var(--ins-font-sans, "Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)';
// Deliberately unbranded: the platform's own code face, not a shipped
// developer font. Mono is reserved for literal identifiers (block paths,
// slugs, raw values); anything that is prose, a label, or a number uses the
// sans with tabular figures instead.
export const FONT_MONO = 'var(--ins-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)';

// ---------------------------------------------------------------------------
// Legacy aliases, consumed by surfaces that didn't migrate to the new tokens.
// ---------------------------------------------------------------------------

export const BORDER_SOFT   = HAIRLINE;
export const TEXT_PRIMARY  = TEXT_HI;
// ---------------------------------------------------------------------------
// Block-type metadata (colour + label). The badge drawing lives with the rest
// of the icons; see `typeIconFor` in `icons.jsx`.
// ---------------------------------------------------------------------------

/**
 * Metadata for a blockType this build doesn't know, e.g. an older SDK against a
 * newer backend. Keeps the row rendering instead of throwing on the lookup.
 *
 * @type {{ color: string, label: string }}
 */
export const TYPE_META_FALLBACK = { color: "rgb(186, 204, 230)", label: "Unknown" };

/** @type {Record<string, { color: string, label: string }>} */
// Hue groups the family rather than the individual type: text shades of blue,
// choices of violet, addresses of sand, the two repeatables of amber. A badge
// then reads as "one of the text ones" before it is read at all.
export const TYPE_META = {
  ShortText:  { color: "rgb(186, 204, 230)", label: "Short" },
  LongText:   { color: "rgb(186, 204, 230)", label: "Long" },
  RichText:   { color: "rgb(208, 192, 230)", label: "Rich" },
  Number:     { color: "rgb(196, 214, 200)", label: "Number" },
  Bool:       { color: "rgb(196, 214, 200)", label: "Yes/No" },
  Url:        { color: "rgb(228, 204, 164)", label: "URL" },
  Date:       { color: "rgb(184, 222, 214)", label: "Date" },
  Image:      { color: "rgb(174, 218, 184)", label: "Image" },
  Link:       { color: "rgb(228, 204, 164)", label: "Link" },
  Select:     { color: "rgb(212, 196, 232)", label: "Select" },
  StringArray:       { color: "rgb(212, 196, 232)", label: "Strings" },
  ObjectArray:     { color: "rgb(222, 204, 174)", label: "Objects" },
  Collection: { color: COLLECTION_ACCENT, label: "Item" },
};

// Legacy alias: TYPE_STYLES had { color, bg, ring, label } per type.
// Derived from TYPE_META so the two stay in lock-step.
/** @type {Record<string, { color: string, bg: string, ring: string, label: string }>} */
export const TYPE_STYLES = Object.fromEntries(
  Object.entries(TYPE_META).map(([k, m]) => [
    k,
    {
      color: m.color,
      bg: tintFromColor(m.color, 0.1),
      ring: tintFromColor(m.color, 0.22),
      label: m.label,
    },
  ]),
);

/**
 * Turn a colour into a translucent tint: `rgba(..., a)` for plain `rgb(...)`
 * literals, else `color-mix` (so `var(--ins-*)` accent tokens still track a
 * themed base colour).
 *
 * @param {string} color
 * @param {number} alpha   0..1
 */
function tintFromColor(color, alpha) {
  const match = /^rgb\(([^)]+)\)$/i.exec(color);
  if (match) return `rgba(${match[1]}, ${alpha})`;
  return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
}

// 50% accent tint for dirty-dot glows (was the `${ACCENT}80` hex-alpha form,
// invalid now that ACCENT resolves through a `var(...)`).
export const ACCENT_GLOW = "color-mix(in srgb, var(--ins-accent, #c9b896) 50%, transparent)";
