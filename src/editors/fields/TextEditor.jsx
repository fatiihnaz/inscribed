"use client";

/**
 * @file Plain-text field editor: a single-line `<input>` by default, or a
 * `<textarea>` when `multiline` is set (for `LongText` and the legacy `Text`
 * alias). Use `RichText` when the field needs formatting.
 */

import { useLayoutEffect, useRef } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.multiline]  Render a `<textarea>` instead of `<input>`.
 * @param {boolean} [props.autoGrow]
 *   Multiline only, on by default: the box grows into its content instead of
 *   scrolling inside a fixed height, because a nested scroll area inside the
 *   drawer's own scroll traps the wheel and hides content. Opt out for a
 *   fixed-height box the editor drags the handle on themselves.
 * @param {number} [props.rows]        `autoGrow={false}` only.
 * @param {React.ReactNode} [props.label]  Overrides the built-in caption.
 * @param {string|null} [props.help]
 * @param {boolean} [props.hideLabel]  Drop the caption when a parent already
 *   labels the field.
 * @param {import("../styles.js").FieldVariantName} [props.variant]
 */
export function TextEditor({
  value, onChange, disabled, multiline, autoGrow = true, rows = 4,
  label, help, hideLabel, variant,
}) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const textareaRef = useRef(/** @type {HTMLTextAreaElement|null} */ (null));

  // Reset to `auto` first so the field can also shrink when text is deleted.
  useLayoutEffect(() => {
    if (!multiline || !autoGrow) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline, autoGrow]);


  const control = multiline ? (
    <textarea
      ref={textareaRef}
      className={`inscribed-field ${v.className}`.trim()}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={autoGrow ? undefined : rows}
      style={autoGrow
        // Auto-grow owns the height, so manual resize would just be undone on
        // the next keystroke. The floor is enough to read as a textarea rather
        // than an input, and no more: it grows into its content anyway.
        ? { resize: "none", overflow: "hidden", minHeight: 46 }
        : { resize: "vertical", minHeight: 72, lineHeight: 1.5 }}
    />
  ) : (
    <input
      type="text"
      className={`inscribed-field ${v.className}`.trim()}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );

  if (hideLabel) return control;

  return (
    <FieldShell label={label ?? t("editors.text.label")} help={help} variant={variant}>
      {control}
    </FieldShell>
  );
}
