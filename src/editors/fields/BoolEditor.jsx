"use client";

/**
 * @file Yes/no field editor, drawn as a switch. Its own row layout rather than
 * `FieldShell`'s stack: a switch reads as a setting, with the caption beside it
 * instead of above it.
 *
 * The checkbox stays in the tree (visually hidden) so the control keeps native
 * keyboard and screen-reader behaviour; the track is decoration, and reads its
 * checked and focus states off the input in CSS.
 */

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
  const caption = typeof label === "string"
    ? <span style={v.labelText}>{label}</span>
    : label;

  return (
    <label
      className={v.className}
      style={{ ...switchRowStyle, ...(disabled ? disabledRowStyle : null) }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {caption ?? null}
        {help ? <span style={v.help}>{help}</span> : null}
      </div>
      <input
        type="checkbox"
        className="inscribed-switch-input"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={hiddenInputStyle}
      />
      <span className="inscribed-switch" />
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
const hiddenInputStyle = { position: "absolute", opacity: 0, width: 0, height: 0 };
