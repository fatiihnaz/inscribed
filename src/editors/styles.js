/**
 * @file Shared styles for the field editors so the dark admin panel reads as
 * one cohesive surface.
 *
 * Consumes the shared design tokens from `shared/style/tokens.js` so the
 * editor fields track the panel palette (and any `theme` override) instead of
 * hand-rolling their own white-alpha values.
 */

import { BORDER, SURFACE_2, TEXT_HI, TEXT_MUTED, TEXT_FAINT, FS_XS, FS_MD, R_MD, RADIUS } from "../../shared/style/tokens.js";

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
