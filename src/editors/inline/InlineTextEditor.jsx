"use client";

/**
 * @file `<InlineTextEditor>`: uncontrolled contentEditable for editing a plain
 * Text/ShortText/LongText block in place on the page.
 *
 * Uncontrolled on purpose: the value is written into the DOM through a ref, only
 * when it differs from what's already there, so a keystroke doesn't flow back as
 * React children and jump the caret to the end. The owning `<EditableRegion>`
 * seeds `value` from the same draft the editor writes to, so post-input the DOM
 * already matches and the sync effect no-ops.
 *
 * Text blocks are plain strings, so paste is forced to text/plain (no HTML
 * nodes leak into the block) and, for single-line types, Enter commits via blur
 * instead of inserting a newline.
 */

import { useEffect, useRef } from "react";

// One stylesheet for the empty-state placeholder, injected once on the client.
// `[data-empty]` (presence) rather than `:empty` so a stray browser <br> left
// after deleting the last character doesn't hide the hint.
let styleInjected = false;
function ensureInlineTextStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-inscribed-inline", "");
  el.textContent =
    ".inscribed-inline-text{outline:none;}" +
    ".inscribed-inline-text[data-empty]::before{content:attr(data-placeholder);opacity:0.45;pointer-events:none;}";
  document.head.appendChild(el);
}

/**
 * @param {Object} props
 * @param {string} [props.tag]   HTML tag to render (matches the block's `as`).
 * @param {string} props.value
 * @param {(text: string) => void} props.onInput
 * @param {() => void} [props.onFocus]
 * @param {() => void} [props.onBlur]
 * @param {boolean} [props.singleLine]  Enter commits (blur) instead of a newline.
 * @param {string} [props.placeholder]
 * @param {string} [props.className]
 * @param {React.CSSProperties} [props.style]
 */
export function InlineTextEditor({
  tag: Tag = "span",
  value,
  onInput,
  onFocus,
  onBlur,
  singleLine = false,
  placeholder,
  className = "",
  style,
  ...rest
}) {
  const ref = useRef(/** @type {HTMLElement|null} */ (null));
  // Skip draft writes and value-sync mid-IME-composition, where reading the
  // partial buffer and rewriting textContent both corrupt the composing text.
  const composingRef = useRef(false);

  useEffect(() => {
    ensureInlineTextStyle();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || composingRef.current) return;
    const next = value ?? "";
    if (el.textContent !== next) el.textContent = next;
  }, [value]);

  /** @param {React.FormEvent<HTMLElement>} e */
  const handleInput = (e) => {
    if (composingRef.current) return;
    onInput(e.currentTarget.textContent ?? "");
  };

  /** @param {React.ClipboardEvent<HTMLElement>} e */
  const handlePaste = (e) => {
    e.preventDefault();
    const raw = e.clipboardData?.getData("text/plain") ?? "";
    const text = singleLine ? raw.replace(/\r?\n/g, " ") : raw;
    const el = ref.current;
    try {
      if (!document.execCommand || !document.execCommand("insertText", false, text)) {
        insertTextAtCaret(text);
      }
    } catch {
      insertTextAtCaret(text);
    }
    if (el) onInput(el.textContent ?? "");
  };

  /** @param {React.KeyboardEvent<HTMLElement>} e */
  const handleKeyDown = (e) => {
    if (singleLine && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <Tag
      {...rest}
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!singleLine}
      data-empty={value ? undefined : ""}
      data-placeholder={placeholder}
      className={`inscribed-inline-text${className ? ` ${className}` : ""}`}
      style={style}
      onInput={handleInput}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        onInput(e.currentTarget.textContent ?? "");
      }}
    />
  );
}

/**
 * Selection/Range fallback for browsers where `execCommand("insertText")` is
 * unavailable. Replaces the current selection with a text node.
 *
 * @param {string} text
 */
function insertTextAtCaret(text) {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
