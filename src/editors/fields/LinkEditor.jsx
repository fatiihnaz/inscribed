"use client";

/**
 * @file Link field editor. Value shape: `{ href: string, label: string }`.
 *
 * One framed control holding two rows, not two captioned fields stacked: the
 * halves are different content (the address is where it goes, the label is what
 * the visitor reads) but they are one value, and a block card that already
 * names the field does not need two more captions under it. The glyph on each
 * row says which half it is, so the captions become placeholders and the frame
 * lights from whichever row has the focus.
 *
 * Reach for `Url` when only the address is wanted.
 */

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { looksLikeAddress } from "../../shared/util/url.js";
import { Link as LinkIcon, TypeShortText } from "../../shared/style/icons.jsx";
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

  const suspect = href.trim().length > 0 && !looksLikeAddress(href);

  return (
    <FieldShell label={label} help={help} variant={variant} as="div">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className={`inscribed-field-group ${v.className}`.trim()}>
          <Row icon={<TypeShortText size={15} />}>
            <input
              type="text"
              value={text}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder={t("editors.link.label")}
              aria-label={t("editors.link.label")}
              className={`inscribed-field ${v.className}`.trim()}
              style={inputStyle}
              disabled={disabled}
            />
          </Row>

          <Row icon={<LinkIcon size={15} />}>
            <input
              type="url"
              value={href}
              onChange={(e) => patch({ href: e.target.value })}
              placeholder="https://…"
              aria-label={t("editors.link.url")}
              spellCheck={false}
              className={`inscribed-field ${v.className}`.trim()}
              style={inputStyle}
              disabled={disabled}
            />
          </Row>
        </div>

        {suspect ? <span style={warnStyle}>{t("editors.url.suspect")}</span> : null}
      </div>
    </FieldShell>
  );
}

/**
 * One half of the frame: a glyph in the gutter and the input beside it. The
 * glyph is positioned rather than laid out so the input still fills the row and
 * its own click target reaches the left edge. Row geometry and the rule between
 * two rows belong to `.inscribed-field-group`, so nothing about them is here.
 *
 * @param {{ icon: React.ReactNode, children: React.ReactNode }} props
 */
function Row({ icon, children }) {
  return (
    <div>
      <span aria-hidden="true" style={iconStyle}>{icon}</span>
      {children}
    </div>
  );
}

// The same gutter, glyph size and dimming the date field uses, so a link row and
// a date row start their text on the same vertical. Centred by an offset rather
// than by the flex row, which does not lay out an absolutely placed child.
const iconStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  left: 12,
  top: "50%",
  marginTop: -7,
  display: "inline-flex",
  pointerEvents: "none",
  opacity: 0.4,
});

const inputStyle = /** @type {React.CSSProperties} */ ({ paddingLeft: 34 });

const warnStyle = { color: STATUS_WARN, fontSize: FS_XS, lineHeight: 1.45 };
