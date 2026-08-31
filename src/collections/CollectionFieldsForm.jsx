"use client";

import { lazy, Suspense } from "react";

import { itemSummary, singularize } from "../shared/util/text.js";
import { seedValues } from "./record-payload.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { fieldVariant } from "../editors/styles.js";
import { ObjectArrayEditor } from "../editors/ObjectArrayEditor.jsx";
import { FieldShell } from "../editors/fields/FieldShell.jsx";
import { TextEditor } from "../editors/fields/TextEditor.jsx";
import { NumberEditor } from "../editors/fields/NumberEditor.jsx";
import { BoolEditor } from "../editors/fields/BoolEditor.jsx";
import { UrlEditor } from "../editors/fields/UrlEditor.jsx";
import { DateEditor } from "../editors/fields/DateEditor.jsx";
import { SelectEditor } from "../editors/fields/SelectEditor.jsx";
import { StringArrayEditor } from "../editors/fields/StringArrayEditor.jsx";
import { LinkEditor } from "../editors/fields/LinkEditor.jsx";
import { ImageEditor } from "../editors/fields/ImageEditor.jsx";
import { FIELD_HOVER } from "../editors/field-css.js";
import { COLLECTION_ACCENT, FS_XS, FS_SM, R_BADGE, dynamicSize } from "../shared/style/tokens.js";

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
 * input per field. `Select` reads its choices from the field's `source`;
 * `ObjectArray` renders a repeatable accordion sub-form through this same
 * renderer, so nested scalars (and further nesting) come for free.
 *
 * Pure rendering; the parent owns state. Seeding, request shaping and
 * required-field validation live in `record-payload.js`, backend error wording
 * in `record-errors.js`.
 *
 * `variant` decides the palette, so the same form is the drawer's own controls
 * inside the drawer and portable mid-greys on a host page. It defaults to
 * `neutral`: this renders for hosts through the public `inscribed/collections`
 * export, where the surface behind it is unknown. `RichText` is the exception
 * either way, since its TipTap surface is dark-oriented.
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
 *   variant?: import("../editors/styles.js").FieldVariantName,
 * }} props
 */
export function CollectionFieldsForm({ fields, values, onChange, disabled, variant = "neutral" }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  if (!fields || fields.length === 0) {
    return <div style={emptyHintStyle}>{t("collections.emptySchema")}</div>;
  }
  return (
    // Marks the whole record form as a collection surface, which is what turns
    // every focus ring, checkmark and chosen cell inside it to the collection
    // accent. The palette class rides along so anything inside styling itself
    // from the custom properties resolves without being handed the variant.
    // See `field-css.js`.
    <div
      className={`inscribed-collection ${v.className}`.trim()}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(next) => onChange({ ...values, [field.name]: next })}
          disabled={Boolean(disabled) || field.readOnly || field.computed}
          variant={variant}
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
 *   variant: import("../editors/styles.js").FieldVariantName,
 * }} props
 */
function FieldInput({ field, value, onChange, disabled, variant }) {
  const t = useCmsStrings();
  const palette = fieldVariant(variant);
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
  const shell = { label: labelNode, help: field.help, variant };
  const common = { ...shell, value, onChange, disabled };

  // Only `Select` carries a source, so nothing here has to decide whether a
  // choice list makes sense for the type: the type already said.
  const choice = { source: field.source, allowCustom: field.allowCustom };

  switch (field.type) {
    case "Bool":     return <BoolEditor {...common} />;
    case "Number":   return <NumberEditor {...common} />;
    case "Url":      return <UrlEditor {...common} />;
    case "Link":     return <LinkEditor {...common} />;
    case "Select":
      return <SelectEditor {...common} {...choice} placeholder={t("collections.selectOption")} />;
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
          <ImageEditor value={value} onChange={onChange} disabled={disabled} variant={variant} />
        </FieldShell>
      );

    case "StringArray":
      return (
        <FieldShell {...shell} as="div">
          <StringArrayEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            variant={variant}
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
          <ObjectArrayEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            addLabel={singularize(field.label || field.name)}
            variant={variant}
            seedItem={() => seedValues(itemFields, {})}
            summarize={(item) => itemSummary(itemFields, item)}
            renderItem={(item, set) => (
              <CollectionFieldsForm
                fields={itemFields}
                values={item}
                onChange={set}
                disabled={disabled}
                variant={variant}
              />
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
  fontSize: dynamicSize(10),
  fontWeight: 600,
  letterSpacing: "-0.005em",
  padding: "2px 6px",
  borderRadius: R_BADGE,
  background: FIELD_HOVER,
  opacity: 0.6,
};

const emptyHintStyle = { color: "currentColor", opacity: 0.6, fontSize: FS_SM };
