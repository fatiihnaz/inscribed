"use client";

/**
 * @file `useRichTextEditor()`: the shared Tiptap setup (extensions, editable
 * gating, value<->HTML sync) behind the drawer's `RichTextEditor` and the
 * page-side inline editor, so both share one config and the same cursor-safe
 * sync. Returns the Tiptap editor instance; callers render `EditorContent` and
 * a toolbar around it.
 *
 * `contentClass` is applied to the ProseMirror surface (ProseMirror rejects
 * inline styles there): the drawer passes its themed class, the inline editor a
 * minimal one that inherits the page's typography.
 */

import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

// Tiptap returns "<p></p>" for an empty doc. Normalise to "" so the dirty/clean
// diff upstream (JSON equality vs block.value) matches a freshly-seeded empty
// block instead of marking it permanently dirty.
const EMPTY_DOC_HTML = "<p></p>";

/**
 * @param {Object} params
 * @param {string} params.value
 * @param {(value: string) => void} params.onChange
 * @param {boolean} [params.disabled]
 * @param {string} [params.contentClass]
 * @returns {import("@tiptap/react").Editor | null}
 */
export function useRichTextEditor({ value, onChange, disabled, contentClass = "inscribed-rte-content" }) {
  const suppressUpdateRef = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: { attributes: { class: contentClass } },
    onUpdate: ({ editor }) => {
      if (suppressUpdateRef.current) return;
      const html = editor.getHTML();
      onChange(html === EMPTY_DOC_HTML ? "" : html);
    },
  });

  // Release the initial suppression once the instance exists so real edits flow.
  useEffect(() => {
    if (!editor) return undefined;
    suppressUpdateRef.current = false;
    return () => {
      suppressUpdateRef.current = true;
    };
  }, [editor]);

  // Mirror external value replacements (reset, refetch, discard) onto the
  // editor. Skipping when equal avoids the per-keystroke setContent that would
  // otherwise nuke the cursor.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (incoming === current) return;
    if (incoming === "" && current === EMPTY_DOC_HTML) return;
    suppressUpdateRef.current = true;
    editor.commands.setContent(incoming || "", false);
    suppressUpdateRef.current = false;
  }, [editor, value]);

  // `editable` is only read at init, so toggle it imperatively on change.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return editor;
}
