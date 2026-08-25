"use client";

import { lazy, Suspense } from "react";

import { itemSummary, singularize } from "../shared/util/text.js";
import { seedValues } from "./record-payload.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { fieldVariant } from "../editors/styles.js";
import { RepeatEditor } from "../editors/RepeatEditor.jsx";
import { FieldShell } from "../editors/fields/FieldShell.jsx";
import { TextEditor } from "../editors/fields/TextEditor.jsx";
import { NumberEditor } from "../editors/fields/NumberEditor.jsx";
import { BoolEditor } from "../editors/fields/BoolEditor.jsx";
import { UrlEditor } from "../editors/fields/UrlEditor.jsx";
import { DateEditor } from "../editors/fields/DateEditor.jsx";
import { SelectEditor } from "../editors/fields/SelectEditor.jsx";
import { StringArrayEditor } from "../editors/fields/StringArrayEditor.jsx";
import { ImageEditor } from "../editors/fields/ImageEditor.jsx";
import { neutralTint as neutral, COLLECTION_ACCENT, FS_XS, FS_SM, R_BADGE } from "../shared/style/tokens.js";

// Every control on this form speaks the portable palette, so the same record
// form reads on the dark drawer and on a light page via CollectionComposer.
/** @type {import("../editors/styles.js").FieldVariantName} */
const VARIANT = "neutral";
const palette = fieldVariant(VARIANT);

// Types a select cannot express: a boolean, a structured value, a formatted
// document, and `StringArray`, which reads `options` as a vocabulary instead.
const NOT_A_SELECT = new Set(["Bool", "Image", "ObjectArray", "RichText", "StringArray"]);

// Lazy so the heavy TipTap dep stays out of the main bundle: a consumer using
// only page-side pieces shouldn't pay ~50KB for an editor they never open. A
// static import would pull it into index.js's eager graph (no `sideEffects`, so
// tree-shaking wouldn't drop it). Fetched the first time a RichText field renders.
const RichTextEditor = lazy(() =>
  import("../editors/rich-text/RichTextEditor.jsx").then((m) => ({ default: m.RichTextEditor })),
);

/**
 * @file `CollectionFieldsForm`: schema-driven form renderer for collection
 * items. Takes `CollectionFieldDescriptor`s plus a values map and renders one
 * input per field. `options` switches a field to a select regardless of `type`;
 * `ObjectArray` renders a repeatable accordion sub-form through this same
 * renderer, so nested scalars (and further nesting) come for free.
 *
 * Pure rendering; the parent owns state. Seeding, request shaping and
 * required-field validation live in `record-payload.js`, backend error wording
 * in `record-errors.js`.
 *
 * Scalar inputs are neutral so they sit on either a dark drawer or a light
 * page. `RichText` is the exception: its TipTap surface is dark-oriented, fine
 * since the real edit path is the dark drawer.
 */

/**
 * @import { CollectionFieldDescriptor } from "../shared/contracts/schemas.js"
 */

/**
 * @param {{
 *   fields: CollectionFieldDescriptor[],
 *   values: Record<string, *>,
 *   onChange: (next: Record<string, *>) => void,
 *   disabled?: boolean,
 * }} props
 */
export function CollectionFieldsForm({ fields, values, onChange, disabled }) {
  const t = useCmsStrings();
  if (!fields || fields.length === 0) {
    return <div style={emptyHintStyle}>{t("collections.emptySchema")}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(v) => onChange({ ...values, [field.name]: v })}
          disabled={Boolean(disabled) || field.readOnly || field.computed}
        />
      ))}
    </div>
  );
}

/**
 * @param {{
 *   field: CollectionFieldDescriptor,
 *   value: *,
 *   onChange: (next: *) => void,
 *   disabled: boolean,
 * }} props
 */
function FieldInput({ field, value, onChange, disabled }) {
  const t = useCmsStrings();
  const labelNode = (
    <span style={palette.labelRow}>
      <span style={palette.labelText}>{field.label || field.name}</span>
      {field.required ? <span style={requiredMarkStyle} aria-label={t("collections.requiredField")}>*</span> : null}
      {/* Computed says where the value comes from, which read-only does not:
          it is fetched from another system each read, so nobody can edit it
          here and nothing the user types would be stored. */}
      {field.computed ? (
        <span style={readonlyTagStyle}>{t("collections.computedField")}</span>
      ) : field.readOnly ? (
        <span style={readonlyTagStyle}>{t("block.readOnly")}</span>
      ) : null}
    </span>
  );

  // Caption, help text and palette are the same whichever control this is; only
  // the control differs.
  const shell = { label: labelNode, help: field.help, variant: VARIANT };
  const common = { ...shell, value, onChange, disabled };

  // `options` constrains the type; it is not a type of its own. On a scalar it
  // narrows the field to one choice. `StringArray` takes it as the vocabulary
  // its entries come from (its own case below), and the rest ignore it: a select
  // writes a plain string, which is the wrong shape for a boolean, an image or a
  // sub-form, so honouring it there corrupted the record.
  const options = field.options && field.options.length > 0 ? field.options : null;
  if (options && !NOT_A_SELECT.has(field.type)) {
    return <SelectEditor {...common} options={options} placeholder={t("collections.selectOption")} />;
  }

  switch (field.type) {
    case "Bool":     return <BoolEditor {...common} />;
    case "Number":   return <NumberEditor {...common} />;
    case "Url":      return <UrlEditor {...common} />;
    // A record's date is a value, not a deadline someone is watching, so the
    // block editor's countdown would be noise here.
    case "Date":     return <DateEditor {...common} countdown={false} />;
    // Fixed height with a drag handle rather than auto-grow: a record form is
    // a stack of many fields, and boxes that resize as you type make the whole
    // form jump.
    case "LongText": return <TextEditor {...common} multiline autoGrow={false} />;

    case "Image":
      return (
        <FieldShell {...shell} as="div">
          <ImageEditor value={value} onChange={onChange} disabled={disabled} />
        </FieldShell>
      );

    case "StringArray":
      return (
        <FieldShell {...shell} as="div">
          <StringArrayEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            variant={VARIANT}
            options={options}
            itemLabel={singularize(field.label || field.name || t("collections.itemFallback"))}
          />
        </FieldShell>
      );

    // The repeat shell knows nothing about schemas: seeding, the collapsed
    // summary and the sub-form all arrive as callbacks, which is also what lets
    // this file render itself inside one without the two importing each other.
    case "ObjectArray": {
      const itemFields = field.itemFields ?? [];
      return (
        <FieldShell {...shell} as="div">
          <RepeatEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            addLabel={singularize(field.label || field.name)}
            seedItem={() => seedValues(itemFields, {})}
            summarize={(item) => itemSummary(itemFields, item)}
            renderItem={(item, set) => (
              <CollectionFieldsForm fields={itemFields} values={item} onChange={set} disabled={disabled} />
            )}
          />
        </FieldShell>
      );
    }

    // `hideLabel` because the shell already names the field; the editor's own
    // caption would say it twice.
    case "RichText":
      return (
        <FieldShell {...shell} as="div">
          <Suspense fallback={<div style={palette.help}>{t("collections.editorLoading")}</div>}>
            <RichTextEditor value={value ?? ""} onChange={onChange} disabled={disabled} hideLabel />
          </Suspense>
        </FieldShell>
      );

    case "ShortText":
    default:         return <TextEditor {...common} />;
  }
}

// ---- Styles ---------------------------------------------------------------

const requiredMarkStyle = {
  color: COLLECTION_ACCENT,
  fontSize: FS_XS,
  fontWeight: 700,
  lineHeight: 1,
};
const readonlyTagStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "-0.005em",
  padding: "2px 6px",
  borderRadius: R_BADGE,
  background: neutral(10),
  opacity: 0.6,
};

const emptyHintStyle = { color: "currentColor", opacity: 0.6, fontSize: FS_SM };
