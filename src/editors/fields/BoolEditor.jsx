"use client";

/**
 * @file Yes/no field editor, drawn as a switch. Its own row layout rather than
 * `FieldShell`'s stack: a switch reads as a setting, with the caption beside it
 * instead of above it.
 *
 * The checkbox stays in the tree (visually hidden) so the control keeps native
 * keyboard and screen-reader behaviour; the track and thumb are decoration.
 */

import { COLLECTION_ACCENT, R_PILL, neutralTint as neutral } from "../../shared/style/tokens.js";
import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   value: boolean | null | undefined,
 *   onChange: (value: boolean) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function BoolEditor({ value, onChange, disabled, label, help, variant }) {
  const v = fieldVariant(variant);
  const on = Boolean(value);
  const caption = typeof label === "string"
    ? <span style={v.labelText}>{label}</span>
    : label;

  return (
    <label style={{ ...switchRowStyle, ...(disabled ? disabledRowStyle : null) }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {caption ?? null}
        {help ? <span style={v.help}>{help}</span> : null}
      </div>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={hiddenInputStyle}
      />
      <span style={{ ...trackStyle, ...(on ? trackCheckedStyle : null) }}>
        <span style={{ ...thumbStyle, ...(on ? thumbCheckedStyle : null) }} />
      </span>
    </label>
  );
}

// ---- Styles ---------------------------------------------------------------

const switchRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 0",
  cursor: "pointer",
};
const disabledRowStyle = { opacity: 0.5, cursor: "not-allowed" };

// Accent is the collection one because that is the only surface this renders on
// today; it follows the variant once Bool becomes a block type too.
const trackStyle = {
  position: "relative",
  flexShrink: 0,
  width: 32,
  height: 18,
  borderRadius: R_PILL,
  background: neutral(25),
  transition: "background 160ms ease",
};
const trackCheckedStyle = {
  background: `color-mix(in srgb, ${COLLECTION_ACCENT} 80%, transparent)`,
};
const thumbStyle = {
  position: "absolute",
  top: 2,
  left: 2,
  width: 14,
  height: 14,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  transition: "left 160ms ease",
};
const thumbCheckedStyle = { left: 16 };
const hiddenInputStyle = { position: "absolute", opacity: 0, width: 0, height: 0 };
