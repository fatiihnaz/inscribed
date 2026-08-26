"use client";

/**
 * @file Tag list editor: removable chips, plus one adder underneath.
 *
 * The adder is the shared `Combobox` in `add` mode, which covers every shape
 * this field takes. With a vocabulary it lists what has not been picked yet;
 * with `allowCustom` it also creates what was typed; pointing at a collection it
 * searches records and stores their slugs. Multi-line paste splits into one
 * entry per line throughout.
 *
 * Wording still comes from the `collections.*` catalog, which is where this
 * editor grew up; the keys move when the two catalogs are reorganised.
 */

import { useMemo } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { fieldVariant, noItemsStyle } from "../styles.js";
import { X } from "../../shared/style/icons.jsx";
import { Combobox } from "./Combobox.jsx";
import { useChoiceSource } from "./use-choice-source.js";
import { choiceLabel, choiceSlug } from "../../shared/util/choice-value.js";

/**
 * @import { ChoiceSource } from "../../shared/contracts/schemas.js"
 */

/**
 * @param {{
 *   value: string[] | null | undefined,
 *   onChange: (value: string[]) => void,
 *   itemLabel: string,
 *   source?: ChoiceSource | null,
 *   allowCustom?: boolean,
 *   locale?: string | null,
 *   disabled?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   `itemLabel` names one entry ("Etiket"), for the adder's caption. With no
 *   `source` at all the field is free text, which is the plain tag case.
 */
export function StringArrayEditor({ value, onChange, itemLabel, source, allowCustom, locale, disabled, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  // Entries arrive as slugs or as { slug, label } pairs; only slugs are ever
  // written back, so the list is normalised once here and the labels are read
  // off the original for display.
  const entries = Array.isArray(value) ? value : [];
  const items = entries.map(choiceSlug);
  const { items: choices, search, loading } = useChoiceSource(source, { locale });

  // Free text whenever nothing constrains it: no source, or a source the field
  // is explicitly allowed to go outside of.
  const free = !source || allowCustom;

  // Only what is not already on: re-offering a picked entry just invites the
  // duplicate `add` would drop anyway. A remote source is filtered server-side,
  // so this only trims what came back.
  const unused = useMemo(
    () => choices.filter((c) => !items.includes(c.value)),
    [choices, items],
  );

  /**
   * Adding the same entry twice is never what the editor meant, so a duplicate
   * is dropped rather than refused: the entry is already there, which is the
   * outcome they were after.
   *
   * @param {string} raw
   */
  const add = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
  };

  // A closed vocabulary that has run out has nothing left to offer, so the adder
  // stands down rather than sitting there empty. A searched source always keeps
  // it: the next query may return something new.
  const showAdder = !disabled && (free || search || unused.length > 0);

  return (
    <div style={shellStyle}>
      {items.length === 0 ? (
        <div style={noItemsStyle}>{t("collections.noItems")}</div>
      ) : (
        <div style={chipRowStyle}>
          {entries.map((entry, i) => (
            <span key={i} className={`inscribed-chip ${v.className}`.trim()}>
              {choiceLabel(entry)}
              {!disabled && (
                <button
                  type="button"
                  className="inscribed-chip-remove"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  aria-label={t("collections.removeNamed", { item: choiceLabel(entry) })}
                  title={t("collections.remove")}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {showAdder && (
        <Combobox
          mode="add"
          items={unused}
          onPick={add}
          onCreate={free ? add : undefined}
          onSearch={search}
          loading={loading}
          placeholder={itemLabel
            ? t("collections.addNamedPlaceholder", { name: itemLabel })
            : t("editors.combobox.add")}
          variant={variant}
        />
      )}
    </div>
  );
}

// ---- Styles ---------------------------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const chipRowStyle = { display: "flex", flexWrap: "wrap", gap: 6 };


