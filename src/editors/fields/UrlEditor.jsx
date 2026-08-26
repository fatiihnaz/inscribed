"use client";

/**
 * @file Bare-address field editor. Value is the URL string on its own; use
 * `LinkEditor` when the address also needs the text it shows as.
 *
 * The address is checked but never blocked: a warning under the box says it
 * does not look like a link, and the value saves either way. A CMS field holds
 * whatever the site actually needs, and refusing to store it would be worse
 * than a wrong-looking address.
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { looksLikeAddress } from "../../shared/util/url.js";
import { STATUS_WARN, FS_XS } from "../../shared/style/tokens.js";

/**
 * @param {{
 *   value: string | null | undefined,
 *   onChange: (value: string) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function UrlEditor({ value, onChange, disabled, label, help, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const text = value ?? "";
  const suspect = text.trim().length > 0 && !looksLikeAddress(text.trim());

  return (
    <FieldShell label={label} help={help} variant={variant}>
      <input
        type="url"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="https://…"
        spellCheck={false}
        className={`inscribed-field ${v.className}`.trim()}
      />
      {suspect ? (
        <span style={warnStyle}>{t("editors.url.suspect")}</span>
      ) : null}
    </FieldShell>
  );
}


const warnStyle = { color: STATUS_WARN, fontSize: FS_XS, lineHeight: 1.45 };
