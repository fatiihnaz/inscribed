"use client";

/**
 * @file Plain-text block editor: a single-line `<input>` by default, or a
 * `<textarea>` when `FieldEditor` passes `multiline` (for `LongText` and the
 * legacy `Text` alias). Use `RichText` when the field needs formatting.
 */

import { useLayoutEffect, useRef } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { fieldStyle, fieldDisabledStyle, labelStyle, labelTextStyle } from "./styles.js";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.multiline]  Render a `<textarea>` instead of `<input>`.
 * @param {boolean} [props.hideLabel]  Drop the built-in caption when a parent
 *   already labels the field.
 */
export function TextEditor({ value, onChange, disabled, multiline, hideLabel }) {
  const t = useCmsStrings();
  const textareaRef = useRef(/** @type {HTMLTextAreaElement|null} */ (null));

  // Grow to fit instead of scrolling inside a fixed box: a nested scroll area
  // inside the drawer's own scroll traps the wheel and hides content. Reset to
  // `auto` first so the field can also shrink when text is deleted.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const control = multiline ? (
    <textarea
      ref={textareaRef}
      className="inscribed-field"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        ...fieldStyle,
        // Auto-grow owns the height, so manual resize would just be undone on
        // the next keystroke.
        resize: "none",
        overflow: "hidden",
        // Enough to read as a textarea rather than an input, and no more: the
        // field grows into its content anyway, so anything past that is empty
        // space on every short field in the drawer.
        minHeight: 46,
        ...(disabled ? fieldDisabledStyle : null),
      }}
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
      <span style={labelTextStyle}>{t("editors.text.label")}</span>
      {control}
    </label>
  );
}
