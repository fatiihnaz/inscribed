"use client";

/**
 * @file Placeholder rows for a list that is still fetching.
 *
 * The drawer used to spend its loading state on `emptyStateStyle`, the dashed
 * "nothing here" box, which says the opposite of what is true while a request
 * is in flight. These stand in the rows' own geometry instead, so the list does
 * not jump when the real ones land.
 */

import { R_BADGE, R_MD, R_SM, TEXT_FAINT } from "../shared/style/tokens.js";

/**
 * @param {{
 *   count?: number,
 *   lines?: 1 | 2,
 *   height?: number,
 *   gap?: number,
 *   lead?: "glyph" | "thumb" | "mark",
 * }} props
 *   `lines` and `lead` match the row being stood in for, and they have to: a
 *   placeholder at the wrong height is a list that jumps the moment the real
 *   rows land, which is the one thing a skeleton exists to prevent.
 *
 *   - `glyph` — the collections list's 20px type badge.
 *   - `thumb` — a record row's 34px image.
 *   - `mark`  — the 8px rule a record row wears where its collection declares
 *     no image. Drawn solid rather than shimmering: it is chrome the row always
 *     has, not content still on its way.
 */
export function SkeletonRows({ count = 4, lines = 1, height = 32, gap = 8, lead = "glyph" }) {
  return (
    <ul style={listStyle} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} style={{ ...rowStyle, minHeight: height, gap }}>
          {lead === "mark" ? (
            <span style={markStyle} />
          ) : (
            <span
              className="inscribed-skeleton"
              style={lead === "thumb" ? thumbStyle : glyphStyle}
            />
          )}
          <span style={{ ...textColStyle, gap: lines === 2 ? 5 : 0 }}>
            <span
              className="inscribed-skeleton"
              style={{
                ...barStyle,
                height: lines === 2 ? 9 : 8,
                width: `${LEAD_WIDTHS[i % LEAD_WIDTHS.length]}%`,
              }}
            />
            {lines === 2 ? (
              <span
                className="inscribed-skeleton"
                style={{ ...barStyle, height: 7, width: `${SUB_WIDTHS[i % SUB_WIDTHS.length]}%` }}
              />
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Uneven on purpose: equal-length bars read as a table, not as text.
const LEAD_WIDTHS = [62, 44, 71, 38, 55];
const SUB_WIDTHS = [80, 58, 66, 74, 49];

const listStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
  padding: "0 16px",
  listStyle: "none",
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: R_MD,
});

const glyphStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: R_BADGE,
});

const thumbStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 34,
  height: 34,
  borderRadius: R_SM,
});

const markStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 8,
  height: 1,
  marginRight: 2,
  borderRadius: 1,
  background: TEXT_FAINT,
});

const textColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
});

const barStyle = /** @type {React.CSSProperties} */ ({
  borderRadius: 3,
});
