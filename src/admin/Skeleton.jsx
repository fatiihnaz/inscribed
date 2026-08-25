"use client";

/**
 * @file Placeholder rows for a list that is still fetching.
 *
 * The drawer used to spend its loading state on `emptyStateStyle`, the dashed
 * "nothing here" box, which says the opposite of what is true while a request
 * is in flight. These stand in the rows' own geometry instead, so the list does
 * not jump when the real ones land.
 */

import { R_BADGE, R_MD } from "../shared/style/tokens.js";

/**
 * @param {{ count?: number, lines?: 1 | 2, height?: number }} props
 *   `lines` matches the row being stood in for: collection rows carry an
 *   identity line and a property line, record rows carry one.
 */
export function SkeletonRows({ count = 4, lines = 1, height = 32 }) {
  return (
    <ul style={listStyle} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} style={{ ...rowStyle, minHeight: height }}>
          <span className="inscribed-skeleton" style={glyphStyle} />
          <span style={textColStyle}>
            <span
              className="inscribed-skeleton"
              style={{ ...barStyle, width: `${LEAD_WIDTHS[i % LEAD_WIDTHS.length]}%` }}
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
  gap: 8,
  padding: "6px 12px",
  borderRadius: R_MD,
});

const glyphStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: R_BADGE,
});

const textColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 5,
});

const barStyle = /** @type {React.CSSProperties} */ ({
  height: 8,
  borderRadius: 3,
});
