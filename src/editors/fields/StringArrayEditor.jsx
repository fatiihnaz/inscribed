"use client";

/**
 * @file Free-text list editor, drawn as removable chips with an add box under
 * them. Value is a plain `string[]`; the draft box holds what is being typed
 * and is not part of the value until it is committed.
 *
 * Wording still comes from the `collections.*` catalog, which is where this
 * editor grew up; the keys move when the two catalogs are reorganised.
 */

import { useState } from "react";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { Plus } from "../../shared/style/icons.jsx";
import { FS_SM, R_SM, neutralTint as neutral } from "../../shared/style/tokens.js";
import { fieldVariant, noItemsStyle } from "../styles.js";

/**
 * @param {{
 *   value: string[] | null | undefined,
 *   onChange: (value: string[]) => void,
 *   itemLabel: string,
 *   options?: string[] | null,
 *   disabled?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   `itemLabel` names one entry ("Etiket"), for the add box's placeholder.
 *   `options`, when non-empty, turns the field into a fixed vocabulary: entries
 *   are picked from the list instead of typed.
 */
export function StringArrayEditor({ value, onChange, itemLabel, options, disabled, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const [draft, setDraft] = useState("");
  const items = Array.isArray(value) ? value : [];
  const vocabulary = options && options.length > 0 ? options : null;
  const unused = vocabulary ? vocabulary.filter((o) => !items.includes(o)) : [];

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

  const commit = () => {
    add(draft);
    setDraft("");
  };

  return (
    <div style={shellStyle}>
      {items.length === 0 ? (
        <div style={noItemsStyle}>{t("collections.noItems")}</div>
      ) : (
        <div style={chipRowStyle}>
          {items.map((item, i) => (
            <span key={i} style={chipStyle}>
              {item}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  style={chipRemoveStyle}
                  aria-label={t("collections.removeNamed", { item })}
                  title={t("collections.remove")}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {/* A fixed vocabulary picks instead of typing, and the picker only lists
          what is not already on. Once everything is picked it disappears rather
          than sitting there empty. */}
      {!disabled && vocabulary && unused.length > 0 && (
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          className="inscribed-field"
          style={{ ...v.field, fontSize: FS_SM }}
        >
          <option value="">{t("collections.addNamedPlaceholder", { name: itemLabel })}</option>
          {unused.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {!disabled && !vocabulary && (
        <div style={addRowStyle}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
            placeholder={t("collections.addNamedPlaceholder", { name: itemLabel })}
            className="inscribed-field"
            style={{ ...v.field, flex: 1, fontSize: FS_SM }}
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            style={addBtnStyle}
          >
            <Plus size={13} />
            {t("collections.add")}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Styles ---------------------------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const chipRowStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 5px 3px 10px",
  borderRadius: R_SM,
  border: `1px solid ${neutral(25)}`,
  background: neutral(8),
  fontSize: FS_SM,
  lineHeight: 1.4,
  marginTop: -1,
};
const chipRemoveStyle = {
  background: "none",
  border: "none",
  padding: "0 1px",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  color: "inherit",
  opacity: 0.5,
  fontFamily: "inherit",
};
const addRowStyle = { display: "flex", gap: 6 };
const addBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 12px",
  border: `1px solid ${neutral(25)}`,
  borderRadius: R_SM,
  background: neutral(8),
  color: "inherit",
  fontSize: FS_SM,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
