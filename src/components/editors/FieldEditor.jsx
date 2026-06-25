"use client";

/**
 * @file Single source of truth for "blockType -> editor component" dispatch,
 * used by both `BlockCard` and `ListEditor`. Primitive types render the same
 * editor everywhere (so a new one is added once); List / DataSource get `null`
 * so the caller supplies its own surface.
 */

import { lazy, Suspense } from "react";

import { TextEditor } from "./TextEditor.jsx";
import { ImageEditor } from "./ImageEditor.jsx";
import { LinkEditor } from "./LinkEditor.jsx";
import { DateEditor } from "./DateEditor.jsx";
import { TEXT_MUTED } from "../admin-drawer-styles.js";

// Lazy so the heavy TipTap dep stays out of the eager drawer chunk; fetched the
// first time a RichText field renders. Same pattern as `CollectionFieldsForm`.
const RichTextEditor = lazy(() =>
  import("./RichTextEditor.jsx").then((m) => ({ default: m.RichTextEditor })),
);

/**
 * @import { BlockType } from "../../lib/schemas.js"
 */

/**
 * Render the editor for a primitive block type, or `null` for composite types
 * (List, DataSource, unknown) so the caller supplies its own surface.
 * `ShortText` is a single-line input, `LongText` (and the legacy `Text` alias)
 * a textarea. `hideLabel` is forwarded; editors that ignore it just drop it.
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