"use client";

/**
 * @file Plain-text block editor. Uses a `<textarea>` so multi-line text
 * works out of the box; switch to `<input>` if you need a single line.
 */

import { fieldStyle, fieldDisabledStyle, labelStyle, labelTextStyle } from "./styles.js";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function TextEditor({ value, onChange, disabled }) {
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>Metin</span>
      <textarea
        className="inscribed-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={disabled}
        style={{ ...fieldStyle, resize: "vertical", ...(disabled ? fieldDisabledStyle : null) }}
      />
    </label>
  );
}
