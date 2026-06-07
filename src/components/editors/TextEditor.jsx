"use client";

/**
 * @file Plain-text block editor. Single line by default (a `<input>`) —
 * short strings like a name or title are the common case. `FieldEditor`
 * passes `multiline` for `LongText` (and the legacy `Text` alias), which
 * renders a `<textarea>`; reach for `RichText` when the field needs
 * formatting.
 */

import { fieldStyle, fieldDisabledStyle, labelStyle, labelTextStyle } from "./styles.js";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.multiline]  Render a `<textarea>` instead of the
 *   default single-line `<input>`.
 * @param {boolean} [props.hideLabel]  Drop the built-in "Metin" caption —
 *   used when a parent (e.g. `ListEditor`) already labels the field.
 */
export function TextEditor({ value, onChange, disabled, multiline, hideLabel }) {
  const control = multiline ? (
    <textarea
      className="inscribed-field"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      disabled={disabled}
      style={{ ...fieldStyle, resize: "vertical", ...(disabled ? fieldDisabledStyle : null) }}
    />
  ) : (
    <input
      type="text"
      className="inscribed-field"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ ...fieldStyle, ...(disabled ? fieldDisabledStyle : null) }}
    />
  );

  if (hideLabel) return control;

  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>Metin</span>
      {control}
    </label>
  );
}
