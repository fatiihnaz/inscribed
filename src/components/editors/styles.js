/**
 * @file Shared styles for inline editors so the dark admin panel reads as
 * one cohesive surface.
 *
 * Consumes the shared design tokens from `admin-drawer-styles.js` so the
 * editor fields track the panel palette (and any `theme` override) instead
 * of hand-rolling their own white-alpha values.
 */

import {
  BORDER,
  SURFACE_2,
  TEXT_HI,
  TEXT_MUTED,
  FS_2XS,
  fieldBaseStyle,
} from "../admin-drawer-styles.js";

export const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

export const labelTextStyle = {
  fontSize: FS_2XS,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
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
