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
    case "RichText":  return <RichTextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Image":     return <ImageEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Link":      return <LinkEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Date":      return <DateEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    default:          return null;
  }
}