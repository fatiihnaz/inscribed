/**
 * @file Shared styles for inline editors so the dark admin panel reads as
 * one cohesive surface.
 *
 * Mirrors the design tokens defined inline in AdminDrawer.jsx (warm-neutral
 * primary ramp + sage secondary accent). Keep these in sync if the panel
 * palette is ever recentred.
 */

export const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

export const labelTextStyle = {
  fontSize: 10,
  color: "rgba(255,255,255,0.3)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};

export const fieldStyle = {
  font: "inherit",
  fontSize: 13,
  padding: "9px 12px",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.96)",
  outline: "none",
};

// Merged on top of `fieldStyle` for read-only (`editable={false}`) blocks.
// Dims the field and swaps the caret for a not-allowed cursor so the lock
// reads at the field level, not just the card header.
export const fieldDisabledStyle = {
  opacity: 0.55,
  cursor: "not-allowed",
};
