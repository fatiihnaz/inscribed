"use client";

/**
 * @file Link field editor. Value shape: `{ href: string, label: string }`.
 *
 * Two boxes rather than one, because the halves are different content: the
 * address is where it goes, the label is what the visitor reads. Reach for `Url`
 * when only the address is wanted.
 */

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { looksLikeAddress } from "../../shared/util/url.js";
import { STATUS_WARN, FS_XS } from "../../shared/style/tokens.js";
import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @typedef {Object} LinkValue
 * @property {string} href
 * @property {string} label
 */

/**
 * @param {{
 *   value: LinkValue | null | undefined,
 *   onChange: (value: LinkValue) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   `label` captions the field as a whole; the link's own label is part of
 *   `value`.
 */
export function LinkEditor({ value, onChange, disabled, label, help, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const href = value?.href ?? "";
  const text = value?.label ?? "";

  /** @param {Partial<LinkValue>} p */
  const patch = (p) => onChange({ href, label: text, ...p });

  const inputStyle = { ...v.field, ...(disabled ? v.disabled : null) };
  const suspect = href.trim().length > 0 && !looksLikeAddress(href);

  return (
    <FieldShell label={label} help={help} variant={variant} as="div">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FieldShell label={t("editors.link.label")} variant={variant}>
          <input
            type="text"
            value={text}
            onChange={(e) => patch({ label: e.target.value })}
            className="inscribed-field"
            disabled={disabled}
            style={inputStyle}
          />
        </FieldShell>

        <FieldShell label={t("editors.link.url")} variant={variant}>
          <input
            type="url"
            value={href}
            onChange={(e) => patch({ href: e.target.value })}
            placeholder="https://…"
            spellCheck={false}
            className="inscribed-field"
            disabled={disabled}
            style={inputStyle}
          />
          {suspect ? <span style={warnStyle}>{t("editors.url.suspect")}</span> : null}
        </FieldShell>
      </div>
    </FieldShell>
  );
}

const warnStyle = { color: STATUS_WARN, fontSize: FS_XS, lineHeight: 1.45 };
