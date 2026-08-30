/**
 * @file Shared styles for the field editors, in two palettes.
 *
 * `drawer` tracks the dark admin panel's tokens (and any `theme` override).
 * `neutral` is mid-gray alphas plus `currentColor`, for editors that also
 * render on a light host page through `CollectionComposer`. Pick one with
 * `fieldVariant(name)` rather than importing the halves separately.
 *
 * The two still carry slightly different geometry (padding, radius, size);
 * converging them is a deliberate follow-up, since it is the one change here
 * that is visible rather than structural.
 */

import {
  BORDER, BG_RAISED, TEXT_HI, TEXT_MUTED, TEXT_FAINT,
  FS_XS, FS_SM, R_MD, RADIUS, dynamicSize,
} from "../shared/style/tokens.js";

/**
 * "Nothing added yet", for the repeatable editors.
 *
 * No frame: a dashed box drawn around nothing is a second empty object stacked
 * on the empty one, and every repeatable puts the control that fills it
 * directly below wearing the same dashes. A quiet line standing where the first
 * entry would says it without competing with the thing to click. The inset
 * matches a row's, so the line sits where a row sits.
 *
 * `opacity` rather than a text token, since these editors also render on a
 * light host page where the white-alpha ramp is invisible.
 */
export const noItemsStyle = {
  fontSize: FS_SM,
  opacity: 0.5,
  padding: "5px 6px",
};


export const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

// The shape a floating panel's body and footer take, shared by the calendar and
// the picker so the two sit at the same rhythm. Colour comes from the palette's
// `panel`; only geometry is fixed here.
export const panelBodyStyle = {
  borderRadius: R_MD + 4,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 0,
};

// `minHeight` holds the row open when neither slot has anything in it, so
// clearing a value does not take a strip of panel with it.
export const panelFootStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 26,
};

// Sentence case at the panel's own size: the drawer's section headings and
// menus all speak this way, and tracked-out micro-caps read as a badge rather
// than a label.
export const labelTextStyle = {
  fontSize: FS_XS,
  color: TEXT_MUTED,
  letterSpacing: "-0.005em",
  fontWeight: 500,
};



// The "nothing here" placeholder, shared by the drawer's panes and by
// ListEditor. It lives with the field styles rather than in `drawer-styles.js`
// so the editor kit doesn't have to reach up into `admin/` for it.
export const emptyStateStyle = {
  margin: "8px 16px",
  padding: 16,
  color: TEXT_FAINT,
  fontSize: dynamicSize(12),
  lineHeight: 1.55,
  border: `1px dashed ${BORDER}`,
  borderRadius: RADIUS,
  textAlign: "center",
};

// ---- Palettes --------------------------------------------------------------

const drawerVariant = {
  label: labelStyle,
  labelRow: { display: "inline-flex", alignItems: "baseline", gap: 6 },
  labelText: labelTextStyle,
  help: { color: TEXT_MUTED, fontSize: FS_XS, lineHeight: 1.45 },
  // Marks a region so `field-css.js` can hand it this palette's custom
  // properties. The drawer's values are the defaults, so it needs no class.
  className: "",
  // A floating panel is portalled out of the card, so nothing sits behind it:
  // unlike the field styles it has to paint an opaque background of its own.
  panel: {
    background: BG_RAISED,
    color: TEXT_HI,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 12px 32px -8px rgba(0, 0, 0, 0.55)",
    // Nothing resets box-sizing for the SDK's own markup, and a panel that
    // matches its trigger's width carries padding and a border on top of it.
    // Under content-box that lands it wider than the frame positioning it,
    // which clips whatever sits at the right edge.
    boxSizing: "border-box",
  },
  // "Chosen" is a tinted, outlined cell rather than a solid accent block: at
  // the size these render (a calendar day, a month chip) a full fill reads as a
  // heavy stamp and drags the eye off everything around it.
  // Anything merging this in has to state a resting `fontWeight` of its own:
  // these cells set the `font` shorthand, and a weight that appears only while
  // selected is a longhand being removed out from under a shorthand on the way
  // back out, which React warns about and browsers resolve inconsistently.
};

// `currentColor` and gray alphas rather than tokens, so these read on the dark
// drawer and on a light page without being told which one they are on.
const neutralVariant = {
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: FS_SM, color: "inherit" },
  labelRow: { display: "inline-flex", alignItems: "baseline", gap: 6 },
  labelText: { fontSize: FS_XS, fontWeight: 500, letterSpacing: "-0.005em", opacity: 0.65 },
  help: { color: "currentColor", opacity: 0.5, fontSize: FS_XS, lineHeight: 1.45 },
  className: "inscribed-neutral",
  // Everything else on this palette is a translucent tint over whatever the
  // host provides, but a portalled panel has no host behind it to blend
  // into: it was `Canvas`/`CanvasText` (the UA's own opaque pair) here, on
  // the idea that those track the host's effective color-scheme. In practice
  // they track the OS/browser's, which is neither the host's nor the drawer's,
  // so the popover came out an off-brand white as often as it came out right.
  // It reads as ours in both places wearing the product's own dark panel
  // instead, same as the drawer gets.
  panel: drawerVariant.panel,
};

/**
 * @typedef {typeof drawerVariant} FieldVariant
 * @typedef {"drawer" | "neutral"} FieldVariantName
 */

/**
 * Resolve a palette by name, falling back to `drawer` so an editor rendered
 * without a variant keeps the panel look it had before palettes existed.
 *
 * @param {FieldVariantName} [name]
 * @returns {FieldVariant}
 */
export function fieldVariant(name) {
  return name === "neutral" ? neutralVariant : drawerVariant;
}
