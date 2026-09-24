"use client";

/**
 * @file `LanguageChips`: which languages a new record is being written in, and
 * the way to add or drop one. Built from the field kit's chips, so it reads the
 * same on the drawer and on a host page.
 */

import { Check, X } from "../shared/style/icons.jsx";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { fieldVariant } from "../editors/styles.js";

/**
 * @import { LanguageStatus } from "./hooks/use-multilingual-create.js"
 */

// Mid tones, because the same dot sits on the dark panel and on a light page.
const READY = "rgb(64, 160, 100)";
const MISSING = "rgb(214, 140, 50)";

/**
 * @param {{
 *   languages: string[],
 *   added: string[],
 *   statusOf: (locale: string) => LanguageStatus,
 *   hasDraft: (locale: string) => boolean,
 *   onAdd: (locale: string) => void,
 *   onRemove: (locale: string) => void,
 *   disabled?: boolean,
 *   variant?: import("../editors/styles.js").FieldVariantName,
 * }} props
 */
export function LanguageChips({ languages, added, statusOf, hasDraft, onAdd, onRemove, disabled, variant = "neutral" }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const chipClass = `inscribed-chip ${v.className}`.trim();

  return (
    <div role="group" aria-label={t("collections.languages")} style={rowStyle}>
      <span style={v.labelText}>{t("collections.languages")}</span>

      {added.map((locale) => {
        const status = statusOf(locale);
        const code = locale.toUpperCase();
        const description = status.state === "created"
          ? t("collections.languageCreated", { locale: code })
          : status.state === "missing"
            ? t("collections.languageMissing", { locale: code, field: status.field })
            : t("collections.languageReady", { locale: code });
        // A created language is already live, and the last one standing is
        // the record itself.
        const removable = !disabled && added.length > 1 && status.state !== "created";
        return (
          <span
            key={locale}
            className={chipClass}
            style={removable ? chipStyle : { ...chipStyle, paddingRight: 10 }}
            title={description}
          >
            {status.state === "created"
              ? <Check size={12} aria-hidden="true" />
              : <span aria-hidden="true" style={{ ...dotStyle, background: status.state === "ready" ? READY : MISSING }} />}
            <span aria-hidden="true" style={codeStyle}>{code}</span>
            <span style={srOnlyStyle}>{description}</span>
            {removable ? (
              <button
                type="button"
                className="inscribed-chip-remove"
                onClick={() => onRemove(locale)}
                aria-label={t("collections.removeLanguage", { locale: code })}
                title={t("collections.removeLanguage", { locale: code })}
              >
                <X size={12} />
              </button>
            ) : null}
          </span>
        );
      })}

      {languages.filter((locale) => !added.includes(locale)).map((locale) => {
        const code = locale.toUpperCase();
        const draft = hasDraft(locale);
        const label = draft
          ? t("collections.addLanguageDraft", { locale: code })
          : t("collections.addLanguage", { locale: code });
        return (
          <button
            key={locale}
            type="button"
            className={`${chipClass} inscribed-chip-more`}
            onClick={() => onAdd(locale)}
            disabled={disabled}
            aria-label={label}
            title={label}
            style={addStyle}
          >
            + {code}
            {draft ? <span aria-hidden="true" style={draftDotStyle} /> : null}
          </button>
        );
      })}
    </div>
  );
}

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
});

const chipStyle = /** @type {React.CSSProperties} */ ({
  position: "relative",
  gap: 6,
});

const codeStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 600,
  letterSpacing: "0.05em",
});

const dotStyle = /** @type {React.CSSProperties} */ ({
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
});

const addStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 600,
  letterSpacing: "0.05em",
});

const draftDotStyle = /** @type {React.CSSProperties} */ ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "currentColor",
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
