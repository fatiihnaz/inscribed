"use client";

/**
 * @file Single source of truth for "blockType -> editor component" dispatch,
 * used by both `BlockCard` and `ListEditor`. Scalar types render the same editor
 * everywhere, so a new one is added once; `ObjectArray` and `Collection` get `null`
 * so the caller supplies its own surface.
 *
 * `hideLabel` is forwarded; editors that ignore it just drop it.
 */

import { lazy, Suspense } from "react";

import { TextEditor } from "./fields/TextEditor.jsx";
import { ImageEditor } from "./fields/ImageEditor.jsx";
import { LinkEditor } from "./fields/LinkEditor.jsx";
import { DateEditor } from "./fields/DateEditor.jsx";
import { NumberEditor } from "./fields/NumberEditor.jsx";
import { BoolEditor } from "./fields/BoolEditor.jsx";
import { UrlEditor } from "./fields/UrlEditor.jsx";
import { SelectEditor } from "./fields/SelectEditor.jsx";
import { StringArrayEditor } from "./fields/StringArrayEditor.jsx";
import { TEXT_MUTED } from "../shared/style/tokens.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";

// Lazy so the heavy TipTap dep stays out of the eager drawer chunk; fetched the
// first time a RichText field renders. Same pattern as `CollectionFieldsForm`.
const RichTextEditor = lazy(() =>
  import("./rich-text/RichTextEditor.jsx").then((m) => ({ default: m.RichTextEditor })),
);

/**
 * @import { BlockType, ChoiceSource } from "../shared/contracts/schemas.js"
 */

/**
 * @param {{
 *   blockType: BlockType | string,
 *   value: *,
 *   onChange: (value: *) => void,
 *   disabled?: boolean,
 *   hideLabel?: boolean,
 *   source?: ChoiceSource | null,
 *   allowCustom?: boolean,
 * }} props
 *   `source` is read by `Select` and nothing else. A Select without one is a
 *   picker offering no options, so it says the source is missing instead. A
 *   `StringArray` never takes one: constraining a list of strings to a set of
 *   options makes it a multi-select, which is what `Select` is for.
 *
 *   A page block carries it the way an `ObjectArray` carries its row schema:
 *   declared by the page and picked up from the runtime registry, so a Select
 *   whose declaring component is not mounted has none and says so rather than
 *   offering an empty list.
 */
export function FieldEditor({ blockType, value, onChange, disabled, hideLabel, source, allowCustom }) {
  switch (blockType) {
    case "ShortText": return <TextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "LongText":  return <TextEditor value={value ?? ""} onChange={onChange} disabled={disabled} multiline hideLabel={hideLabel} />;
    case "RichText":  return (
      <Suspense fallback={<RichTextLoading />}>
        <RichTextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />
      </Suspense>
    );
    case "Number":    return <NumberEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Bool":      return <BoolEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Url":       return <UrlEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Image":     return <ImageEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Link":      return <LinkEditor value={value} onChange={onChange} disabled={disabled} />;
    case "Date":      return <DateEditor value={value} onChange={onChange} disabled={disabled} hideLabel={hideLabel} />;
    case "Select":    return source
      ? <SelectEditor value={value} onChange={onChange} disabled={disabled} source={source} allowCustom={allowCustom} hideLabel={hideLabel} />
      : <MissingSource />;
    case "StringArray": return <StringArrayEditor value={value} onChange={onChange} disabled={disabled} itemLabel="" />;
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

/** Same shape of hint `ListEditor` shows when its row schema never arrived. */
function MissingSource() {
  const t = useCmsStrings();
  return (
    <div style={{ fontSize: 12, color: TEXT_MUTED, padding: "4px 0" }}>
      {t("editors.combobox.noSource")}
    </div>
  );
}
