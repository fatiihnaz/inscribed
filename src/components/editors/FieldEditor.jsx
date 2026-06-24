"use client";

/**
 * @file Single source of truth for "blockType -> editor component" dispatch.
 *
 * Used in two places:
 *   - AdminDrawer's `BlockCard` (top-level block editor surface)
 *   - AdminDrawer's `ListEditor` (per-field editor inside each list item)
 *
 * List + DataSource get `null` back; callers render their own surrounding
 * UI for those (the drawer renders a dedicated ListEditor card; DataSource
 * shows a "consumed by code" hint). For the five primitive types
 * (Text/RichText/Image/Link/Date) every site renders the exact same
 * editor, so keeping the switch here means a new primitive editor only
 * needs to be added once.
 */

import { lazy, Suspense } from "react";

import { TextEditor } from "./TextEditor.jsx";
import { ImageEditor } from "./ImageEditor.jsx";
import { LinkEditor } from "./LinkEditor.jsx";
import { DateEditor } from "./DateEditor.jsx";
import { TEXT_MUTED } from "../admin-drawer-styles.js";

// Lazy so TipTap (a heavy dep, ~5.8MB installed) stays out of the eager
// admin-drawer chunk: an admin who never opens a RichText field shouldn't
// pay for the editor. Mirrors the same pattern in `CollectionFieldsForm`.
// Fetched on demand the first time a RichText field actually renders.
const RichTextEditor = lazy(() =>
  import("./RichTextEditor.jsx").then((m) => ({ default: m.RichTextEditor })),
);

/**
 * @import { BlockType } from "../../lib/schemas.js"
 */

/**
 * Render the right editor for a primitive block type, or `null` for
 * composite/non-primitive types (List, DataSource, unknown). Returning
 * `null` lets the caller decide what to show in place of an unsupported
 * editor (a hint, a custom surface, nothing at all).
 *
 * `hideLabel` is forwarded to the editors that honour it; editors that
 * don't simply ignore it. The line-length split is type-driven:
 * `ShortText` edits as a single-line input, `LongText` as a multi-line
 * textarea. The legacy `Text` alias maps to `LongText` (textarea) since
 * that was its original behaviour — existing blocks keep their look.
 *
 * @param {{
 *   blockType: BlockType | string,
 *   value: *,
 *   onChange: (value: *) => void,
 *   disabled?: boolean,
 *   hideLabel?: boolean,
 * }} props
 */
export function FieldEditor({ blockType, value, onChange, disabled, hideLabel }) {
  switch (blockType) {
    case "ShortText": return <TextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Text":
    case "LongText":  return <TextEditor value={value ?? ""} onChange={onChange} disabled={disabled} multiline hideLabel={hideLabel} />;
    case "RichText":  return (
      <Suspense fallback={<div style={{ fontSize: 12, color: TEXT_MUTED, padding: "4px 0" }}>Editör yükleniyor…</div>}>
        <RichTextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />
      </Suspense>
    );
    case "Image":     return <ImageEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Link":      return <LinkEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Date":      return <DateEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    default:          return null;
  }
}