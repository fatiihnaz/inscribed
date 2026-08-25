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
  BORDER, SURFACE_2, TEXT_HI, TEXT_MUTED, TEXT_FAINT,
  FS_XS, FS_SM, FS_MD, R_SM, R_MD, R_BTN, RADIUS, neutralTint as neutral,
} from "../shared/style/tokens.js";

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

export const fieldStyle = {
  ...fieldBaseStyle,
  border: `1px solid ${BORDER}`,
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
  // Native pickers (date, time) draw themselves from this, so the drawer has to
  // say it is dark or they come back as white boxes on a dark field.
  colorScheme: "dark",
};

// `currentColor` and gray alphas rather than tokens, so these read on the dark
// drawer and on a light page without being told which one they are on.
const neutralVariant = {
  field: {
    padding: "8px 10px",
    border: `1px solid ${neutral(22)}`,
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
  // Left to the host page, which may be light.
  colorScheme: undefined,
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
