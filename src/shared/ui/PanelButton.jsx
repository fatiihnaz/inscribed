"use client";

/**
 * @file The button every floating panel is built out of.
 *
 * Each of these used to be its own little component: the calendar had four, the
 * picker two, the combobox one, and all seven wired up the same hover and
 * focus swap by hand. The differences between them are geometry, so geometry is
 * what `shape` picks and `style` tops up; the reactions live in CSS, where the
 * browser already knows how to have them.
 *
 * It takes no palette. The two palettes differ by a pair of custom properties,
 * and those inherit, so a control reads whichever one the region it renders in
 * has set. See `editors/field-css.js`.
 */

import { dynamicSize } from "../style/tokens.js";

/**
 * @typedef {"icon" | "text" | "cell"} PanelButtonShape
 *   `icon` is a square glyph target, `text` a small label, `cell` one tile in a
 *   grid of choices.
 */

/**
 * @param {{
 *   onClick: () => void,
 *   shape?: PanelButtonShape,
 *   label?: string,
 *   selected?: boolean,
 *   disabled?: boolean,
 *   style?: React.CSSProperties,
 *   children: React.ReactNode,
 * }} props
 *   `label` names an icon-only button for a screen reader and as a tooltip;
 *   leave it off where the children already read as the name.
 */
export function PanelButton({
  onClick, shape = "text", label, selected, disabled, style, children,
}) {
  const className = [
    "inscribed-panel-btn",
    `inscribed-panel-btn--${shape}`,
    selected ? "is-selected" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={className}
      style={style}
    >
      {children}
    </button>
  );
}

/** The month/year heading, which is a text button at the panel's own size. */
export const headingButtonStyle = {
  padding: "4px 8px",
  fontSize: dynamicSize(12),
  fontWeight: 600,
  letterSpacing: "-0.005em",
  textTransform: "capitalize",
};
