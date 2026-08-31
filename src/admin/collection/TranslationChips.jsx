"use client";

/**
 * @file `TranslationChips`: one chip per language the collection declares,
 * showing which of them this record's translation group actually has.
 */

import { useMemo } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import {
  translationBarStyle, localeChipCurrentStyle, localeChipStyle,
} from "./collection-styles.js";

/**
 * One chip per language the collection declares, showing which of them this
 * record's translation group actually has.
 *
 * This is what keeps the "add a translation" action honest: a language that
 * already exists offers to open it instead of creating a second one. The
 * backend rejects the duplicate either way, but by then the editor has already
 * written the record, and the rejection can't tell them where the existing one
 * is.
 *
 * Renders nothing for a collection with no declared languages, which is every
 * collection on a backend without translation support.
 *
 * @param {{
 *   item: import("../../shared/contracts/schemas.js").CollectionItemResponse | null,
 *   locales: string[] | undefined,
 *   canEdit: boolean,
 *   onOpenItem: (slug: string) => void,
 *   onAddTranslation: (locale: string, translationGroupId: string) => void,
 * }} props
 */
export function TranslationChips({ item, locales, canEdit, onOpenItem, onAddTranslation }) {
  const t = useCmsStrings();
  const bySlug = useMemo(() => {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const entry of item?.translations ?? []) out.set(entry.locale, entry.slug);
    return out;
  }, [item]);

  if (!locales?.length || !item) return null;
  const groupId = item.translationGroupId;

  return (
    <div style={translationBarStyle}>
      {locales.map((locale) => {
        const label = locale.toUpperCase();
        if (locale === item.locale) {
          return <span key={locale} style={localeChipCurrentStyle}>{label}</span>;
        }

        const sibling = bySlug.get(locale);
        if (sibling) {
          return (
            <button
              key={locale}
              type="button"
              onClick={() => onOpenItem(sibling)}
              className="inscribed-locale-chip"
              style={localeChipStyle}
              title={`${label}: ${sibling}`}
            >
              {label}
            </button>
          );
        }

        // No sibling yet. Without a group there is nothing to attach one to,
        // so the affordance stays hidden rather than offering an orphan.
        if (!canEdit || !groupId) return null;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onAddTranslation(locale, groupId)}
            className="inscribed-locale-chip inscribed-locale-chip-add"
            style={localeChipStyle}
            title={t("collections.addTranslation", { locale: label })}
          >
            + {label}
          </button>
        );
      })}
    </div>
  );
}
