"use client";

/**
 * @file The switch that puts another language's drafts into the next publish.
 * The status lane and the changes preview each show one per language, and
 * both have to flip the same thing the same way.
 */

import { Check, Plus } from "../shared/style/icons.jsx";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { ACCENT } from "../shared/style/tokens.js";

/**
 * @param {{
 *   language: import("../core/hooks/use-cms-save.js").PendingLanguage,
 *   onToggle: (locale: string) => void,
 *   disabled?: boolean,
 *   children: React.ReactNode,
 * }} props
 */
export function IncludeLanguageButton({ language, onToggle, disabled, children }) {
  const t = useCmsStrings();
  const code = language.locale.toUpperCase();
  const label = t("elsewhere.include", { locale: code, count: language.drafts.length });
  return (
    <button
      type="button"
      // Dashed while left out, the kit's "more is waiting here"; solid once in.
      className={language.included ? "inscribed-chip" : "inscribed-chip inscribed-chip-more"}
      style={language.included ? includedStyle : offeredStyle}
      onClick={() => onToggle(language.locale)}
      disabled={disabled}
      aria-pressed={language.included}
      aria-label={label}
      title={language.included ? t("elsewhere.includedTitle", { locale: code }) : label}
    >
      {language.included ? <Check size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}
      {children}
    </button>
  );
}

const offeredStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexShrink: 0,
  fontWeight: 600,
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
});

const includedStyle = /** @type {React.CSSProperties} */ ({
  ...offeredStyle,
  padding: "3px 9px",
  cursor: "pointer",
  fontFamily: "inherit",
  color: ACCENT,
  borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
  background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
});
