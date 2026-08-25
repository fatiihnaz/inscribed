"use client";

/**
 * @file Single-choice editor for a field that declares an enumerated set of
 * `options`. The empty option is a real choice, not a prompt: clearing a select
 * is how an optional enumerated field goes back to unset.
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   value: string | null | undefined,
 *   onChange: (value: string) => void,
 *   options: string[],
 *   placeholder: string,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function SelectEditor({ value, onChange, options, placeholder, disabled, label, help, variant }) {
  const v = fieldVariant(variant);
  return (
    <FieldShell label={label} help={help} variant={variant}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="inscribed-field"
        style={{ ...v.field, ...(disabled ? v.disabled : null) }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </FieldShell>
  );
}
