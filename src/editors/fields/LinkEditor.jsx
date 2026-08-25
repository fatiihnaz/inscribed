"use client";

/**
 * @file Link block editor. Value shape: `{ href: string, label: string }`.
 */

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { fieldStyle, fieldDisabledStyle, labelStyle, labelTextStyle } from "./styles.js";

/**
 * @typedef {Object} LinkValue
 * @property {string} href
 * @property {string} label
 */

/**
 * @param {Object} props
 * @param {LinkValue|null|undefined} props.value
 * @param {(value: LinkValue) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function LinkEditor({ value, onChange, disabled }) {
  const t = useCmsStrings();
  const href = value?.href ?? "";
  const label = value?.label ?? "";

  /** @param {Partial<LinkValue>} patch */
  const patch = (p) => onChange({ href, label, ...p });

  const inputStyle = disabled ? { ...fieldStyle, ...fieldDisabledStyle } : fieldStyle;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        <span style={labelTextStyle}>{t("editors.link.label")}</span>
        <input
          type="text"
          value={label}
          onChange={(e) => patch({ label: e.target.value })}
          className="inscribed-field"
          disabled={disabled}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>{t("editors.link.url")}</span>
        <input
          type="url"
          value={href}
          onChange={(e) => patch({ href: e.target.value })}
          placeholder="https://..."
          className="inscribed-field"
          disabled={disabled}
          style={inputStyle}
        />
      </label>
    </div>
  );
}
