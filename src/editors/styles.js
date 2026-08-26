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
  ACCENT, BG, BORDER, BORDER_HI, SURFACE_2, SURFACE_3, BG_RAISED,
  TEXT_HI, TEXT_MUTED, TEXT_FAINT,
  FS_XS, FS_SM, FS_MD, R_SM, R_MD, R_BTN, RADIUS, neutralTint as neutral,
} from "../shared/style/tokens.js";

// Focus reads as a soft halo around the control rather than a hard line swapped
// into its border: at 2px and this alpha it registers without the field looking
// like it changed shape. The accent is spent here, on the create action, and on
// the current selection; every other state stays a neutral elevation step, which
// is what keeps a panel full of controls from turning into a colour chart.
const FOCUS_SHADOW = `0 0 0 2px color-mix(in srgb, ${ACCENT} 16%, transparent)`;
const FOCUS_BORDER = `color-mix(in srgb, ${ACCENT} 45%, transparent)`;

// The dashed "nothing added yet" box the repeatable editors share.
export const noItemsStyle = {
  fontSize: FS_SM,
  opacity: 0.5,
  padding: "9px 10px",
  border: `1px dashed ${neutral(25)}`,
  borderRadius: R_BTN,
  textAlign: "center",
};

// Shared input/field geometry. The themeable colour comes from the consumer
// (warm tokens for the inline editors, neutral grays for the portable
// CollectionFieldsForm); only the shape is shared here.
export const fieldBaseStyle = {
  font: "inherit",
  fontSize: FS_MD,
  padding: "9px 12px",
  borderRadius: R_MD,
  outline: "none",
};

export const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
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

// Longhand, not the `border` shorthand: the controls that focus swap only
// `borderColor`, and React warns (then misbehaves) when a longhand is dropped
// while the shorthand covering it is still set.
export const fieldStyle = {
  ...fieldBaseStyle,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: BORDER,
  background: SURFACE_2,
  color: TEXT_HI,
};

// Merged on top of `fieldStyle` for read-only (`editable={false}`) blocks.
// Dims the field and swaps the caret for a not-allowed cursor so the lock
// reads at the field level, not just the card header.
export const fieldDisabledStyle = {
  opacity: 0.55,
  cursor: "not-allowed",
};

// The "nothing here" placeholder, shared by the drawer's panes and by
// ListEditor. It lives with the field styles rather than in `drawer-styles.js`
// so the editor kit doesn't have to reach up into `admin/` for it.
export const emptyStateStyle = {
  margin: "8px 16px",
  padding: 16,
  color: TEXT_FAINT,
  fontSize: 12,
  lineHeight: 1.55,
  border: `1px dashed ${BORDER}`,
  borderRadius: RADIUS,
  textAlign: "center",
};

// ---- Palettes --------------------------------------------------------------

const drawerVariant = {
  field: fieldStyle,
  disabled: fieldDisabledStyle,
  label: labelStyle,
  labelRow: { display: "inline-flex", alignItems: "baseline", gap: 6 },
  labelText: labelTextStyle,
  help: { color: TEXT_MUTED, fontSize: FS_XS, lineHeight: 1.45 },
  border: BORDER,
  hoverBg: SURFACE_3,
  rowRing: BORDER_HI,
  focusShadow: FOCUS_SHADOW,
  focusBorder: FOCUS_BORDER,
  // Native pickers (date, time) draw themselves from this, so the drawer has to
  // say it is dark or they come back as white boxes on a dark field.
  colorScheme: "dark",
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
  selected: {
    background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
    color: ACCENT,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 40%, transparent)`,
    fontWeight: 500,
  },
};

// `currentColor` and gray alphas rather than tokens, so these read on the dark
// drawer and on a light page without being told which one they are on.
const neutralVariant = {
  field: {
    padding: "8px 10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: neutral(22),
    borderRadius: R_SM,
    fontSize: FS_SM,
    lineHeight: 1.4,
    fontFamily: "inherit",
    background: neutral(4),
    color: "inherit",
    outline: "none",
  },
  // No dimming: on this palette the lock already reads from the label's
  // readOnly/computed tag, and dimming as well doubles the signal.
  disabled: null,
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: FS_SM, color: "inherit" },
  labelRow: { display: "inline-flex", alignItems: "baseline", gap: 6 },
  labelText: { fontSize: FS_XS, fontWeight: 500, letterSpacing: "-0.005em", opacity: 0.65 },
  help: { color: "currentColor", opacity: 0.5, fontSize: FS_XS, lineHeight: 1.45 },
  border: neutral(25),
  hoverBg: neutral(12),
  rowRing: neutral(30),
  focusShadow: FOCUS_SHADOW,
  focusBorder: FOCUS_BORDER,
  // Left to the host page, which may be light.
  colorScheme: undefined,
  // Everything else on this palette is a translucent tint over whatever the
  // host provides, but a portalled panel has no host behind it to blend
  // into: it was `Canvas`/`CanvasText` (the UA's own opaque pair) here, on
  // the idea that those track the host's effective color-scheme. In practice
  // they track the OS/browser's, which is neither the host's nor the drawer's,
  // so the popover came out an off-brand white as often as it came out right.
  // It reads as ours in both places wearing the product's own dark panel
  // instead, same as the drawer gets.
  panel: drawerVariant.panel,
  selected: drawerVariant.selected,
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
