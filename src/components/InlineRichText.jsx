"use client";

/**
 * @file `<InlineRichText>`: in-place rich-text editing for a RichText block on
 * the page. Shell-less: the ProseMirror surface inherits the page's typography
 * so editing looks like the published content. The formatting bar is a
 * `RichTextToolbar` portaled to `document.body` with fixed positioning above the
 * caret, so it never joins the block's layout (a narrow block keeps its width
 * and responsiveness) and clamps/wraps against the viewport instead.
 *
 * Lazy-loaded by EditableRegion so Tiptap never reaches the public bundle.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent } from "@tiptap/react";

import { useRichTextEditor } from "../hooks/use-rich-text-editor.js";
import { RichTextToolbar } from "./editors/RichTextToolbar.jsx";

const GAP = 8;
const MARGIN = 8;

// Minimal content styling: just drop the focus outline; everything else is
// inherited from the page so the editor matches the published block.
let styleInjected = false;
function ensureInlineRteStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-inscribed-inline-rte", "");
  el.textContent =
    ".inscribed-inline-rte{outline:none;}.inscribed-inline-rte:focus{outline:none;}";
  document.head.appendChild(el);
}

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {() => void} [props.onFocus]
 * @param {() => void} [props.onBlur]
 * @param {React.CSSProperties} [props.style]
 */
export function InlineRichText({ value, onChange, onFocus, onBlur, style }) {
  const editor = useRichTextEditor({ value, onChange, contentClass: "inscribed-inline-rte" });
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState(/** @type {{ top: number, left: number } | null} */ (null));
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const barRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    ensureInlineRteStyle();
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    const handleFocus = () => {
      setFocused(true);
      onFocus?.();
    };
    const handleBlur = () => {
      setFocused(false);
      onBlur?.();
    };
    editor.on("focus", handleFocus);
    editor.on("blur", handleBlur);
    return () => {
      editor.off("focus", handleFocus);
      editor.off("blur", handleBlur);
    };
  }, [editor, onFocus, onBlur]);

  // Anchor the bar to the block's top edge, not the caret: a caret-anchored bar
  // sits over the line above it (i.e. content). Above the block it clears the
  // text; once the block scrolls past the top it sticks to the viewport top so
  // it stays reachable. RichTextToolbar's flex-wrap handles narrow viewports.
  useLayoutEffect(() => {
    if (!focused) return undefined;
    const place = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const barW = barRef.current?.offsetWidth ?? 0;
      const barH = barRef.current?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      let left = Math.min(Math.max(MARGIN, rect.left), vw - barW - MARGIN);
      if (left < MARGIN) left = MARGIN;
      const top = Math.max(MARGIN, rect.top - barH - GAP);
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [focused]);

  return (
    <div ref={rootRef} style={style}>
      <EditorContent editor={editor} />
      {focused && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={barRef}
              // Keep the editor's selection/focus alive when the bar is clicked;
              // without it a click here blurs the editor and hides the bar.
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "fixed",
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? "visible" : "hidden",
                zIndex: 2147483000,
                maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
                background: "var(--ins-bg, #1c1815)",
                color: "var(--ins-text, #f5f0e8)",
                border: "1px solid rgba(127,127,127,0.24)",
                borderRadius: "var(--ins-radius, 10px)",
                boxShadow: "0 8px 28px -6px rgba(0,0,0,0.4)",
              }}
            >
              <RichTextToolbar editor={editor} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
