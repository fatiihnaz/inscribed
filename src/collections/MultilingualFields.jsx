"use client";

/**
 * @file `MultilingualFields`: a new record's form with every language in it.
 * A prose field gets a row per language under one caption, so the second
 * language is written beside the first rather than behind a tab; every other
 * field is asked once, since it goes into each language's record.
 */

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { fieldVariant } from "../editors/styles.js";
import { FieldMessage } from "../editors/FieldMessage.jsx";
import { TRANSLATABLE_TYPES } from "../shared/util/translatable.js";
import { CollectionFieldInput, CollectionFieldLabel } from "./CollectionFieldsForm.jsx";
import { SlugField, SlugLabel } from "./SlugField.jsx";
import { requiredMissing } from "./record-payload.js";

/**
 * @import { CollectionFieldDescriptor } from "../shared/contracts/schemas.js"
 * @import { MultilingualCreateState } from "./hooks/use-multilingual-create.js"
 */

const MISSING = "rgb(214, 140, 50)";

/**
 * @param {{
 *   fields: CollectionFieldDescriptor[],
 *   create: MultilingualCreateState,
 *   needsSlug: boolean,
 *   onEdit?: () => void,
 *   variant?: import("../editors/styles.js").FieldVariantName,
 * }} props
 *   `onEdit` fires on any change, for a caller clearing a notice about the
 *   last record.
 */
export function MultilingualFields({ fields, create, needsSlug, onEdit, variant = "neutral" }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const { added } = create;
  const several = added.length > 1;

  /** @param {string} locale */
  const locked = (locale) => create.isPending || create.statusOf(locale).state === "created";
  /**
   * @param {string} locale
   * @param {string} name
   * @param {*} value
   */
  const set = (locale, name, value) => {
    create.setField(locale, name, value);
    onEdit?.();
  };
  /**
   * @param {string} locale
   * @param {string} slug
   */
  const setSlug = (locale, slug) => {
    create.setSlug(locale, slug);
    onEdit?.();
  };

  return (
    // The collection accent for every focus ring inside, same as the
    // single-language form.
    <div className={`inscribed-collection ${v.className}`.trim()} style={formStyle}>
      {needsSlug && several ? (
        <div style={v.label}>
          <SlugLabel variant={variant} />
          {added.map((locale) => (
            <LanguageRow
              key={locale}
              locale={locale}
              caption={`${t("collections.slugLabel")} ${locale.toUpperCase()}`}
              missing={!create.slugFor(locale).trim()}
              variant={variant}
            >
              <SlugField
                value={create.slugFor(locale)}
                onChange={(next) => setSlug(locale, next)}
                disabled={locked(locale)}
                variant={variant}
                hideLabel
              />
            </LanguageRow>
          ))}
        </div>
      ) : needsSlug ? (
        <SlugField
          value={create.slugFor(added[0])}
          onChange={(next) => setSlug(added[0], next)}
          disabled={locked(added[0])}
          variant={variant}
        />
      ) : null}

      {fields.map((field) => {
        const fixed = Boolean(field.readOnly || field.computed);
        const prose = TRANSLATABLE_TYPES.has(field.type);
        if (several && prose && !fixed) {
          return (
            <div key={field.name} style={v.label}>
              <CollectionFieldLabel field={field} variant={variant} />
              {added.map((locale) => (
                <LanguageRow
                  key={locale}
                  locale={locale}
                  caption={`${field.label || field.name} ${locale.toUpperCase()}`}
                  missing={Boolean(field.required) && requiredMissing([field], create.valuesFor(locale)) != null}
                  // A rich-text body is not a form control a label can name.
                  labelled={field.type !== "RichText"}
                  variant={variant}
                >
                  <CollectionFieldInput
                    field={field}
                    value={create.valuesFor(locale)[field.name]}
                    onChange={(next) => set(locale, field.name, next)}
                    disabled={locked(locale)}
                    variant={variant}
                    bare
                  />
                </LanguageRow>
              ))}
              {field.help ? <FieldMessage>{field.help}</FieldMessage> : null}
            </div>
          );
        }
        // One control: a field every language shares, or a prose field with a
        // single language in play.
        const locale = added[0];
        const disabled = fixed || (prose ? locked(locale) : create.isPending || create.sharedLocked);
        return (
          <CollectionFieldInput
            key={field.name}
            field={field}
            value={create.valuesFor(locale)[field.name]}
            onChange={(next) => set(locale, field.name, next)}
            disabled={disabled}
            variant={variant}
          />
        );
      })}
    </div>
  );
}

/**
 * One language's line under a shared caption: its code in the gutter, the
 * control beside it.
 *
 * @param {{
 *   locale: string,
 *   caption: string,
 *   missing: boolean,
 *   labelled?: boolean,
 *   variant: import("../editors/styles.js").FieldVariantName,
 *   children: React.ReactNode,
 * }} props
 *   `caption` names the control for assistive tech, since the visible code
 *   alone says which language but not which field.
 */
function LanguageRow({ locale, caption, missing, labelled = true, variant, children }) {
  const v = fieldVariant(variant);
  const Control = labelled ? "label" : "div";
  return (
    <div style={rowStyle}>
      <span
        aria-hidden="true"
        style={missing ? { ...v.labelText, ...badgeStyle, color: MISSING, opacity: 1 } : { ...v.labelText, ...badgeStyle }}
      >
        {locale.toUpperCase()}
      </span>
      <Control style={controlStyle}>
        {labelled ? <span style={srOnlyStyle}>{caption}</span> : null}
        {children}
      </Control>
    </div>
  );
}

const formStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
});

// Down to the field's first text line: its border and padding, less half the
// difference in line height. Same offset the drawer's translation rows use.
const badgeStyle = /** @type {React.CSSProperties} */ ({
  width: 22,
  flexShrink: 0,
  marginTop: 8,
  fontWeight: 600,
  letterSpacing: "0.06em",
});

// A flex column, and that is load-bearing: inputs and textareas size
// themselves from `size`/`cols` inside a block parent and would sit at their
// intrinsic width beside an empty row.
const controlStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
});

const srOnlyStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
});
