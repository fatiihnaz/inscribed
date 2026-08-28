"use client";

/**
 * @file Tag list editor: removable chips, plus a box to type the next one into.
 *
 * There is no vocabulary here, on purpose. A `StringArray` is a free list of
 * strings; constraining it to a set of options makes it a multi-select, which is
 * a different field with a different control, and bolting the option list onto
 * this one only produced a picker you had to open in order to be told nothing
 * matched. `Select` is where choosing from a list lives.
 *
 * Entries are read tolerantly. Records written while the type still carried a
 * vocabulary hold `{ slug, label }` pairs rather than plain strings, so the list
 * is normalised on the way in and only strings are ever written back.
 *
 * Wording still comes from the `collections.*` catalog, which is where this
 * editor grew up; the keys move when the two catalogs are reorganised.
 */

import { useState } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { fieldVariant, noItemsStyle } from "../styles.js";
import { X } from "../../shared/style/icons.jsx";
import { choiceLabel, choiceSlug } from "../../shared/util/choice-value.js";

/**
 * @param {{
 *   value: string[] | null | undefined,
 *   onChange: (value: string[]) => void,
 *   itemLabel: string,
 *   disabled?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   `itemLabel` names one entry ("Etiket"), for the adder's placeholder.
 */
export function StringArrayEditor({ value, onChange, itemLabel, disabled, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const entries = Array.isArray(value) ? value : [];
  const items = entries.map(choiceSlug);

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

      {!disabled && (
        <TagInput
          onAdd={add}
          placeholder={itemLabel
            ? t("collections.addNamedPlaceholder", { name: itemLabel })
            : t("editors.combobox.add")}
          variant={variant}
        />
      )}
    </div>
  );
}

/**
 * Type, press Enter. No trigger and no panel, because there is no list to open.
 *
 * The input keeps its own text rather than lifting it, so a keystroke here does
 * not re-render the chips above it.
 *
 * @param {{
 *   onAdd: (text: string) => void,
 *   placeholder: string,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
function TagInput({ onAdd, placeholder, variant }) {
  const v = fieldVariant(variant);
  const [text, setText] = useState("");

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`inscribed-field ${v.className}`.trim()}
      style={{ width: "100%" }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        // The field often sits in a form; Enter here means one more tag.
        e.preventDefault();
        commit();
      }}
      // A pasted block of lines is a list, not one entry. Saves retyping twenty
      // tags one by one.
      onPaste={(e) => {
        const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length <= 1) return;
        e.preventDefault();
        for (const line of lines) onAdd(line);
        setText("");
      }}
      // Typing and clicking away is a finished tag, not a discarded one.
      onBlur={commit}
    />
  );
}

// ---- Styles ---------------------------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const chipRowStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
