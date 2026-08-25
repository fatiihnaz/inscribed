"use client";

/**
 * @file Bare-address field editor. Value is the URL string on its own; use
 * `LinkEditor` when the address also needs the text it shows as.
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   value: string | null | undefined,
 *   onChange: (value: string) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function UrlEditor({ value, onChange, disabled, label, help, variant }) {
  const v = fieldVariant(variant);
  return (
    <FieldShell label={label} help={help} variant={variant}>
      <input
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="https://…"
        className="inscribed-field"
        style={{ ...v.field, ...(disabled ? v.disabled : null) }}
      />
    </FieldShell>
  );
}
