"use client";

/**
 * @file Tiptap rich-text editor for the admin drawer: the shell (bordered
 * surface + label), the top toolbar, and the content typography. The editor
 * setup lives in `useRichTextEditor` and the buttons in `<RichTextToolbar>`, so
 * the page-side inline editor shares both.
 *
 * Content is HTML, which EditableRegion sanitises with DOMPurify, so pasted
 * hostile markup can only XSS the admin themselves.
 */

import { EditorContent } from "@tiptap/react";

import { useRichTextEditor } from "../../hooks/use-rich-text-editor.js";
import { RichTextToolbar } from "./RichTextToolbar.jsx";
import { labelStyle, labelTextStyle } from "./styles.js";
import { ACCENT, R_MD } from "../admin-drawer-styles.js";

// Theme-portable palette: the editor renders on the dark drawer AND on a light
// host page (CollectionComposer), so text inherits (`currentColor`) and
// surfaces/borders use mid-gray alphas that read on any background. Only the
// accent stays themeable.
const TEXT_PRIMARY  = "currentColor";
const TEXT          = "color-mix(in srgb, currentColor 78%, transparent)";
const SURFACE       = "rgba(127,127,127,0.05)";
const SURFACE_1     = "rgba(127,127,127,0.03)";
const SURFACE_3     = "rgba(127,127,127,0.16)";
const BORDER        = "rgba(127,127,127,0.24)";
const BORDER_FOCUS  = "rgba(127,127,127,0.5)";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.hideLabel]  Drop the built-in "Zengin Metin" caption
 *   when a parent (e.g. `ListEditor`) already labels the field.
 */
export function RichTextEditor({ value, onChange, disabled, hideLabel }) {
  const editor = useRichTextEditor({ value, onChange, disabled });

  return (
    <label style={labelStyle}>
      {hideLabel ? null : <span style={labelTextStyle}>Zengin Metin</span>}
      <style>{rteContentCss}</style>
      <div className="inscribed-rte-shell" style={shellStyle}>
        <RichTextToolbar
          editor={editor}
          disabled={disabled}
          style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE_1 }}
        />
        <div style={contentWrapStyle}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </label>
  );
}

const shellStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${BORDER}`,
  borderRadius: R_MD,
  background: SURFACE,
  overflow: "hidden",
});

const contentWrapStyle = /** @type {React.CSSProperties} */ ({
  padding: "10px 12px",
  minHeight: 120,
  fontSize: 13,
  lineHeight: 1.6,
  color: TEXT_PRIMARY,
});

// Tiptap renders into a contenteditable div; ProseMirror rejects inline styles
// there, so the content is styled via a class. Also covers the shell focus ring
// and the typographic baseline for headings/lists/blockquotes/code. Button
// states live in RichTextToolbar.
const rteContentCss = `
  .inscribed-rte-content {
    outline: none;
    min-height: 100px;
  }
  .inscribed-rte-content p {
    margin: 0 0 0.6em;
  }
  .inscribed-rte-content p:last-child {
    margin-bottom: 0;
  }
  .inscribed-rte-content h2 {
    margin: 0.4em 0 0.4em;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${TEXT_PRIMARY};
  }
  .inscribed-rte-content h3 {
    margin: 0.4em 0 0.3em;
    font-size: 14px;
    font-weight: 600;
    color: ${TEXT_PRIMARY};
  }
  .inscribed-rte-content ul,
  .inscribed-rte-content ol {
    margin: 0 0 0.6em;
    padding-left: 1.4em;
  }
  .inscribed-rte-content li {
    margin: 0.15em 0;
  }
  .inscribed-rte-content blockquote {
    margin: 0 0 0.6em;
    padding: 4px 10px;
    border-left: 2px solid ${ACCENT};
    color: ${TEXT};
    font-style: italic;
  }
  .inscribed-rte-content code {
    padding: 1px 5px;
    border-radius: 4px;
    background: ${SURFACE_3};
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    font-size: 0.9em;
  }
  .inscribed-rte-content a {
    color: ${ACCENT};
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .inscribed-rte-content:focus {
    outline: none;
  }
  .ProseMirror-focused {
    outline: none;
  }
  /* Focus ring on the shell when the editor inside has focus. Inline
     border-color on the shell div forces !important to override. */
  .inscribed-rte-shell:focus-within {
    border-color: ${BORDER_FOCUS} !important;
  }
`;
