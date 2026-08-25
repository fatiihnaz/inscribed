"use client";

/**
 * @file Single source of truth for "blockType -> editor component" dispatch,
 * used by both `BlockCard` and `ListEditor`. Primitive types render the same
 * editor everywhere (so a new one is added once); List / Collection get `null`
 * so the caller supplies its own surface.
 */

import { lazy, Suspense } from "react";

import { TextEditor } from "./fields/TextEditor.jsx";
import { ImageEditor } from "./fields/ImageEditor.jsx";
import { LinkEditor } from "./fields/LinkEditor.jsx";
import { DateEditor } from "./fields/DateEditor.jsx";
import { TEXT_MUTED } from "../shared/style/tokens.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";

// Lazy so the heavy TipTap dep stays out of the eager drawer chunk; fetched the
// first time a RichText field renders. Same pattern as `CollectionFieldsForm`.
const RichTextEditor = lazy(() =>
  import("./rich-text/RichTextEditor.jsx").then((m) => ({ default: m.RichTextEditor })),
);

/**
 * @import { BlockType } from "../shared/contracts/schemas.js"
 */

/**
 * Render the editor for a primitive block type, or `null` for composite types
 * (List, Collection, unknown) so the caller supplies its own surface.
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
      <Suspense fallback={<RichTextLoading />}>
        <RichTextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />
      </Suspense>
    );
    case "Image":     return <ImageEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Link":      return <LinkEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Date":      return <DateEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    default:          return null;
  }
}

/**
 * Its own component so `FieldEditor` stays hook-free: `BlockCard` and
 * `ListEditor` invoke it as a plain function from inside conditionals, where a
 * hook of its own would break the rules of hooks.
 */
function RichTextLoading() {
  const t = useCmsStrings();
  return (
    <div style={{ fontSize: 12, color: TEXT_MUTED, padding: "4px 0" }}>
      {t("editors.richText.loading")}
    </div>
  );
}