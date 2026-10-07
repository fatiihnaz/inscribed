"use client";

/**
 * @file A record's search metadata as its collection maps it (`seo` in the
 * config). Shown, not edited: the record's own fields hold it.
 */

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { imageOf, recordSeoFields, textOf } from "../shared/seo.js";
import { FieldMessage } from "../editors/FieldMessage.jsx";
import { FONT_SANS, HAIRLINE, R_MD, TEXT, TEXT_MUTED, dynamicSize } from "../shared/style/tokens.js";

/**
 * @param {{ collection: string, values: Record<string, *> }} props
 *   `values` is the form's working copy, so the section follows the typing.
 */
export function RecordSeo({ collection, values }) {
  const { config } = useCmsContext();
  const t = useCmsStrings();
  const seo = config.seo?.[collection];
  if (!seo) return null;

  const fields = recordSeoFields(values, seo);
  /**
   * The field the value came from: the first that has one, or the first named.
   * @param {readonly string[]} names
   * @param {(value: *) => *} has
   */
  const source = (names, has) => names.find((name) => has(values[name])) ?? names[0];

  /** @type {{ key: string, field: string, text: string }[]} */
  const rows = [];
  if (seo.title.length) rows.push({ key: "seo.title", field: source(seo.title, textOf), text: fields.title });
  if (seo.description.length) {
    rows.push({ key: "seo.description", field: source(seo.description, textOf), text: fields.description });
  }
  if (seo.image.length) {
    rows.push({ key: "seo.image", field: source(seo.image, imageOf), text: fields.image ? fields.image.alt ?? fields.image.url : "" });
  }
  if (seo.noindex.length) {
    rows.push({
      key: "seo.noindex",
      field: source(seo.noindex, (value) => typeof value === "boolean"),
      text: t(fields.noindex ? "seo.recordHidden" : "seo.recordVisible"),
    });
  }
  if (rows.length === 0) return null;

  return (
    <section style={sectionStyle} aria-label={t("seo.recordHeading")}>
      <div style={headingStyle}>{t("seo.recordHeading")}</div>
      <dl style={listStyle}>
        {rows.map((row) => (
          <div key={row.key} style={rowStyle}>
            <dt style={termStyle}>
              {t(row.key)} <span style={sourceStyle}>{t("seo.fromField", { field: row.field })}</span>
            </dt>
            <dd style={valueStyle}>{row.text || <span style={sourceStyle}>{t("seo.recordEmpty")}</span>}</dd>
          </div>
        ))}
      </dl>
      <FieldMessage>{t("seo.recordNote")}</FieldMessage>
    </section>
  );
}

const sectionStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: R_MD,
  fontFamily: FONT_SANS,
});

const headingStyle = /** @type {React.CSSProperties} */ ({
  fontSize: dynamicSize(11),
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: TEXT_MUTED,
});

const listStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: 0,
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
});

const termStyle = /** @type {React.CSSProperties} */ ({
  fontSize: dynamicSize(11),
  color: TEXT,
});

const sourceStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
});

const valueStyle = /** @type {React.CSSProperties} */ ({
  margin: 0,
  fontSize: dynamicSize(12),
  color: TEXT,
  overflowWrap: "anywhere",
});
