"use client";

/**
 * @file `<RichTextToolbar>`: the Tiptap formatting button row, shared by the
 * drawer's `RichTextEditor` (a static top bar) and the page-side inline editor
 * (a floating bar). Chrome-agnostic: it renders the flex row of buttons and
 * lets the parent supply container styling via `style`/`className` (the drawer
 * adds a bottom border, the floating bar a pill + shadow).
 *
 * The buttons come in runs, and the row spreads its slack between the runs, so
 * whitespace groups them: there are no separator rules to draw. `flexWrap` is
 * the backstop for a bar narrower than even that fits, which wraps rather than
 * overflowing.
 */

import { useEffect } from "react";

import {
  Bold, Italic, Strikethrough, Heading2, Heading3,
  List as ListIcon, ListOrdered, Quote, Code, Link as LinkIcon,
  Undo2, Redo2,
} from "../../shared/style/icons.jsx";
import { ACCENT, ACCENT_SOFT, R_SM } from "../../shared/style/tokens.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";

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
  const t = useCmsStrings();
  useEffect(() => {
    ensureToolbarStyle();
  }, []);

  const cls = dense ? `${className ? `${className} ` : ""}inscribed-rte-dense` : className;
  // Dense matches the page-side ink pills exactly: 2px of padding around 18px
  // controls, so the floating bar and a region's actions row are one family.
  const rowStyle = { ...toolbarStyle, ...(dense ? { padding: 2, gap: 4 } : null), ...style };

  if (!editor) {
    return <div className={className} style={{ ...rowStyle, minHeight: 28 }} />;
  }

  // Read-only: keep the bar in layout for continuity but make it inert.
  if (disabled) {
    return (
      <div
        className={className}
        style={{ ...rowStyle, minHeight: 28, opacity: 0.4, pointerEvents: "none" }}
        aria-disabled="true"
      />
    );
  }

  const handleLink = () => {
    const prev = editor.getAttributes("link").href ?? "";
    // eslint-disable-next-line no-alert
    const url = window.prompt(t("editors.richText.linkPrompt"), prev);
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
      <Group>
        <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title={t("editors.richText.boldTitle")} ariaLabel={t("editors.richText.bold")}>
          <Bold size={12} />
        </Btn>
        <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title={t("editors.richText.italicTitle")} ariaLabel={t("editors.richText.italic")}>
          <Italic size={12} />
        </Btn>
        <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title={t("editors.richText.strike")} ariaLabel={t("editors.richText.strike")}>
          <Strikethrough size={12} />
        </Btn>
        <Btn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title={t("editors.richText.code")} ariaLabel={t("editors.richText.code")}>
          <Code size={12} />
        </Btn>
      </Group>

      <Group>
        <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t("editors.richText.heading2")} ariaLabel={t("editors.richText.heading2")}>
          <Heading2 size={12} />
        </Btn>
        <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={t("editors.richText.heading3")} ariaLabel={t("editors.richText.heading3")}>
          <Heading3 size={12} />
        </Btn>
      </Group>

      <Group>
        <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t("editors.richText.bulletList")} ariaLabel={t("editors.richText.bulletList")}>
          <ListIcon size={12} />
        </Btn>
        <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t("editors.richText.orderedList")} ariaLabel={t("editors.richText.orderedList")}>
          <ListOrdered size={12} />
        </Btn>
        <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={t("editors.richText.quote")} ariaLabel={t("editors.richText.quote")}>
          <Quote size={12} />
        </Btn>
      </Group>

      <Group>
        <Btn active={editor.isActive("link")} onClick={handleLink} title={t("editors.richText.link")} ariaLabel={t("editors.richText.link")}>
          <LinkIcon size={12} />
        </Btn>
      </Group>

      <Group>
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t("editors.richText.undoTitle")} ariaLabel={t("editors.richText.undo")}>
          <Undo2 size={12} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t("editors.richText.redoTitle")} ariaLabel={t("editors.richText.redo")}>
          <Redo2 size={12} />
        </Btn>
      </Group>
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

/**
 * One run of related buttons. The row spreads its slack between its children,
 * so the groups have to be the children: with the buttons themselves as flex
 * items the spare width went into every gap alike and the runs stopped reading
 * as runs. The gap between two runs is the only thing dividing them now, which
 * is why it is several times the gap inside one.
 *
 * @param {{ children: React.ReactNode }} props
 */
function Group({ children }) {
  return <span className="inscribed-rte-group">{children}</span>;
}

const toolbarStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "space-between",
  // The floating bar sizes to its content, so there is no slack to spread there
  // and this gap is the whole separation between two groups.
  gap: 6,
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
    /* Twelve buttons have to make one row inside a list item's rich-text field,
       which is where this bar is narrowest (~290px). That budget is what sets
       the size, and it is why the separators are gone: four hairlines plus
       their margins were the width of two more buttons. */
    .inscribed-rte-btn {
      width: 20px;
      height: 20px;
    }
    .inscribed-rte-dense .inscribed-rte-btn {
      width: 18px;
      height: 18px;
    }
    .inscribed-rte-group {
      display: inline-flex;
      align-items: center;
      gap: 1.5px;
    }
    .inscribed-rte-dense .inscribed-rte-group {
      gap: 1px;
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
