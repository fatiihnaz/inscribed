"use client";

/**
 * @file The panel a block card grows when it needs to say something: a save
 * refused as a conflict, the other languages left behind by a rewrite.
 *
 * One shell, because they are the same object. Both interrupt one block, both
 * sit inside its body, both are answered and dismissed there. Written twice
 * they drifted in three ways at once (tint strength, margin side, where the
 * dismiss lived), and each new one would have started by copying whichever
 * happened to be nearest.
 *
 * What a caller brings is what actually differs: a tone, which side of the
 * editor it sits on, a heading, and its own body. Everything else — the
 * entrance, the frame, the button shapes — is fixed here.
 */

import { Collapse } from "./Collapse.jsx";
import {
  BORDER, HAIRLINE, STATUS_WARN, SURFACE_1, TEXT, TEXT_MID, TEXT_MUTED,
  FONT_SANS, FS_XS, R_BTN, R_MD, R_SM,
} from "../shared/style/tokens.js";

/**
 * Tints derived from one base each, at one pair of strengths. Two hand-picked
 * ramps is how one panel ended up reading as louder than another for no reason
 * anybody chose.
 *
 * @param {string} base
 */
function toneOf(base) {
  return {
    fg: base,
    line: `color-mix(in srgb, ${base} 32%, transparent)`,
    fill: `color-mix(in srgb, ${base} 8%, transparent)`,
  };
}

const TONES = {
  warn: toneOf(STATUS_WARN),
  // Not from the formula: it tints a hue, and grey has none, so mixing the text
  // colour toward transparent gives a fill nobody can see. The panel surface
  // tokens are the grey the rest of the drawer is already built from.
  neutral: { fg: TEXT_MID, line: BORDER, fill: SURFACE_1 },
};

/**
 * Grows and shrinks through `Collapse`, so the editor beside it travels by
 * ordinary reflow rather than by a projection kept in sync with a fade.
 *
 * @param {{
 *   show: boolean,
 *   tone?: "warn" | "neutral",
 *   placement?: "above" | "below",
 *   icon?: React.ReactNode,
 *   title: React.ReactNode,
 *   label: string,
 *   aside?: React.ReactNode,
 *   actions?: React.ReactNode,
 *   children?: React.ReactNode,
 * }} props
 */
export function BlockNotice({
  show, tone = "warn", placement = "above",
  icon, title, label, aside, actions, children,
}) {
  const palette = TONES[tone] ?? TONES.warn;
  return (
    <Collapse show={show}>
      <div
        style={{
          ...wrapStyle,
          border: `1px solid ${palette.line}`,
          background: palette.fill,
          // The breathing room goes on the side facing the editor, so a panel
          // above and one below both read as attached to it rather than
          // floating between the two. Inside the clip, so a shut panel leaves
          // no gap of its own behind.
          margin: placement === "above" ? "2px 0 8px" : "8px 0 2px",
        }}
        role="group"
        aria-label={label}
      >
        <div style={{ ...headingStyle, color: palette.fg }}>
          {icon}
          <span>{title}</span>
          {aside ? <span style={asideStyle}>{aside}</span> : null}
        </div>
        {children}
        {actions ? <div style={actionsStyle}>{actions}</div> : null}
      </div>
    </Collapse>
  );
}

/**
 * A framed surface for content that brings its own chrome (the diff renderers).
 * Caps its height so a long one can't stretch the card past the editor.
 */
export const noticeFrameStyle = /** @type {React.CSSProperties} */ ({
  maxHeight: 220,
  overflowY: "auto",
  borderRadius: R_SM,
  border: `1px solid ${HAIRLINE}`,
  background: SURFACE_1,
});

/**
 * @param {{
 *   onClick: () => void,
 *   tone?: "warn" | "neutral",
 *   variant?: "primary" | "secondary",
 *   children: React.ReactNode,
 *   "aria-label"?: string,
 * }} props
 */
export function NoticeButton({ onClick, tone = "warn", variant = "secondary", children, ...rest }) {
  const palette = TONES[tone] ?? TONES.warn;
  return (
    <button
      type="button"
      onClick={onClick}
      style={variant === "primary" ? {
        ...buttonBaseStyle,
        border: `1px solid ${palette.line}`,
        background: palette.fill,
        color: palette.fg,
      } : {
        ...buttonBaseStyle,
        border: `1px solid ${HAIRLINE}`,
        background: "transparent",
        color: TEXT_MUTED,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

const wrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  borderRadius: R_MD,
  font: `${FS_XS}px/1.5 ${FONT_SANS}`,
  color: TEXT,
});

const headingStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 600,
});

const asideStyle = /** @type {React.CSSProperties} */ ({
  marginLeft: "auto",
  display: "inline-flex",
});

const actionsStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
});

const buttonBaseStyle = /** @type {React.CSSProperties} */ ({
  padding: "5px 10px",
  borderRadius: R_BTN,
  font: `${FS_XS}px/1 ${FONT_SANS}`,
  fontWeight: 600,
  cursor: "pointer",
});
