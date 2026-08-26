"use client";

/**
 * @file Numeric field editor. Value is a number, or `null` when the box is
 * cleared: an empty numeric input means "unset", not zero.
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   value: number | null | undefined,
 *   onChange: (value: number | null) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function NumberEditor({ value, onChange, disabled, label, help, variant }) {
  const v = fieldVariant(variant);
  return (
    <FieldShell label={label} help={help} variant={variant}>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        onWheel={(e) => {
          if (document.activeElement === e.currentTarget) e.currentTarget.blur();
        }}
        disabled={disabled}
        className="inscribed-field"
        style={{ ...v.field, ...(disabled ? v.disabled : null), fontVariantNumeric: "tabular-nums" }}
      />
    </FieldShell>
  );
}
