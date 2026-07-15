"use client";

/**
 * @file `<RichTextToolbar>`: the Tiptap formatting button row, shared by the
 * drawer's `RichTextEditor` (a static top bar) and the page-side inline editor
 * (a floating bar). Chrome-agnostic: it renders the flex row of buttons and
 * lets the parent supply container styling via `style`/`className` (the drawer
 * adds a bottom border, the floating bar a pill + shadow). `flexWrap` means a
 * narrow bar wraps its buttons instead of overflowing.
 */

import { useEffect } from "react";

import {
  Bold, Italic, Strikethrough, Heading2, Heading3,
  List as ListIcon, ListOrdered, Quote, Code, Link as LinkIcon,
  Undo2, Redo2,
} from "../icons.jsx";
import { ACCENT, ACCENT_SOFT, R_SM } from "../admin-drawer-styles.js";

// Portable tones (mid-gray alphas + currentColor) so the buttons read on the
// dark drawer and on a light page alike, matching the editor content.
const TEXT_PRIMARY  = "currentColor";
const TEXT_MUTED    = "color-mix(in srgb, currentColor 55%, transparent)";
const SURFACE_HOVER = "rgba(127,127,127,0.12)";

/**
 * @param {{
 *   editor: import("@tiptap/react").Editor | null,
 *   disabled?: boolean,
 *   className?: string,
 *   style?: React.CSSProperties,
 * }} props
 */
export function RichTextToolbar({ editor, disabled, className, style, dense }) {
  useEffect(() => {
    ensureToolbarStyle();
  }, []);

  const cls = dense ? `${className ? `${className} ` : ""}inscribed-rte-dense` : className;
  const rowStyle = { ...toolbarStyle, ...(dense ? { padding: 3, gap: 1 } : null), ...style };

  if (!editor) {
    return <div className={className} style={{ ...rowStyle, minHeight: 34 }} />;
  }

  // Read-only: keep the bar in layout for continuity but make it inert.
  if (disabled) {
    return (
      <div
        className={className}
        style={{ ...rowStyle, minHeight: 34, opacity: 0.4, pointerEvents: "none" }}
        aria-disabled="true"
      />
    );
  }

  const handleLink = () => {
    const prev = editor.getAttributes("link").href ?? "";
    // eslint-disable-next-line no-alert
    const url = window.prompt("Link URL", prev);
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  // mousedown.preventDefault keeps the editor selection alive across toolbar
  // clicks - without it, clicking Bold blurs the editor, the selection
  // collapses, and the toggle runs against an empty range.
  return (
    <div className={cls} style={rowStyle} onMouseDown={(e) => e.preventDefault()}>
      <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Kalın (Ctrl+B)" ariaLabel="Kalın">
        <Bold size={13} />
      </Btn>
      <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="İtalik (Ctrl+I)" ariaLabel="İtalik">
        <Italic size={13} />
      </Btn>
      <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Üstü çizili" ariaLabel="Üstü çizili">
        <Strikethrough size={13} />
      </Btn>
      <Btn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline kod" ariaLabel="Inline kod">
        <Code size={13} />
      </Btn>

      <Sep />

      <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Başlık 2" ariaLabel="Başlık 2">
        <Heading2 size={13} />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Başlık 3" ariaLabel="Başlık 3">
        <Heading3 size={13} />
      </Btn>

      <Sep />

      <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Madde listesi" ariaLabel="Madde listesi">
        <ListIcon size={13} />
      </Btn>
      <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numaralı liste" ariaLabel="Numaralı liste">
        <ListOrdered size={13} />
      </Btn>
      <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Alıntı" ariaLabel="Alıntı">
        <Quote size={13} />
      </Btn>

      <Sep />

      <Btn active={editor.isActive("link")} onClick={handleLink} title="Link" ariaLabel="Link">
        <LinkIcon size={13} />
      </Btn>

      <Sep />

      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Geri al (Ctrl+Z)" ariaLabel="Geri al">
        <Undo2 size={13} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="İleri al (Ctrl+Shift+Z)" ariaLabel="İleri al">
        <Redo2 size={13} />
      </Btn>
    </div>
  );
}

/**
 * @param {{
 *   active?: boolean, disabled?: boolean, onClick: () => void,
 *   title: string, ariaLabel: string, children: React.ReactNode,
 * }} props
 */
function Btn({ active, disabled, onClick, title, ariaLabel, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={active ? "inscribed-rte-btn inscribed-rte-btn-active" : "inscribed-rte-btn"}
      style={btnStyle}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" style={sepStyle} />;
}

const toolbarStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1.5,
  padding: 4,
});

const btnStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: 0,
  borderRadius: R_SM,
  background: "transparent",
  color: TEXT_MUTED,
  cursor: "pointer",
  transition: "background-color 120ms ease, color 120ms ease",
});

const sepStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-block",
  width: 1,
  height: 16,
  margin: "0 4px",
  background: "rgba(127,127,127,0.24)",
});

// Button interaction states can't be inline (hover/disabled/active); injected
// once. Kept separate from the editor's content typography so the toolbar is
// self-contained wherever it's mounted.
let styleInjected = false;
function ensureToolbarStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-inscribed-rte-toolbar", "");
  el.textContent = `
    .inscribed-rte-btn {
      width: 26px;
      height: 26px;
    }
    .inscribed-rte-dense .inscribed-rte-btn {
      width: 22px;
      height: 22px;
    }
    .inscribed-rte-btn:hover:not(:disabled) {
      background: ${SURFACE_HOVER};
      color: ${TEXT_PRIMARY};
    }
    .inscribed-rte-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .inscribed-rte-btn-active {
      background: ${ACCENT_SOFT} !important;
      color: ${ACCENT} !important;
    }
  `;
  document.head.appendChild(el);
}
