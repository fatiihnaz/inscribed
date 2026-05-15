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

import { TextEditor } from "./TextEditor.jsx";
import { RichTextEditor } from "./RichTextEditor.jsx";
import { ImageEditor } from "./ImageEditor.jsx";
import { LinkEditor } from "./LinkEditor.jsx";
import { DateEditor } from "./DateEditor.jsx";

/**
 * @import { BlockType } from "../../lib/schemas.js"
 */

/**
 * Render the right editor for a primitive block type, or `null` for
 * composite/non-primitive types (List, DataSource, unknown). Returning
 * `null` lets the caller decide what to show in place of an unsupported
 * editor (a hint, a custom surface, nothing at all).
 *
 * @param {{
 *   blockType: BlockType | string,
 *   value: *,
 *   onChange: (value: *) => void,
 * }} props
 */
export function FieldEditor({ blockType, value, onChange }) {
  switch (blockType) {
    case "Text":     return <TextEditor value={value ?? ""} onChange={onChange} />;
    case "RichText": return <RichTextEditor value={value ?? ""} onChange={onChange} />;
    case "Image":    return <ImageEditor value={value} onChange={onChange} />;
    case "Link":     return <LinkEditor value={value} onChange={onChange} />;
    case "Date":     return <DateEditor value={value} onChange={onChange} />;
    default:         return null;
  }
}