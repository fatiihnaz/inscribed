/**
 * @file Shared chrome for the page-side edit affordances: `EditableRegion` and
 * `CollectionItem`.
 *
 * Both draw the same hover ring, the same padded card around block-level
 * content, and the same label chip; only the accent differs (content accent vs
 * collection accent). This lives in one place on purpose: the two kept their
 * own copies once and drifted, leaving the collection wrapper on an older chip
 * that neither straddled the ring nor was clickable.
 */

import { ROOMY_INSET, RING_RADIUS } from "./admin-drawer-styles.js";

/**
 * Tags that make a region block-level, which is what earns it the padded card
 * treatment. Inline content stays tight so a region mid-sentence doesn't
 * balloon the line.
 */
export const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header", "footer", "nav",
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "figure", "figcaption", "table", "form", "pre", "address", "hgroup", "dl",
]);

// Hover shows a neutral line ring; selecting switches to the accent ring plus a
// faint tint (hover -> select hierarchy).
export const RING_HOVER = "inset 0 0 0 1px rgba(127, 127, 127, 0.55)";

/** @param {string} accent */
export const ringActive = (accent) => `0 0 0 1.5px ${accent}`;

/** @param {string} accent */
export const bgActive = (accent) => `color-mix(in srgb, ${accent} 5%, transparent)`;

// Padded card for block-level regions. The negative horizontal margins keep the
// content's own left edge where the page put it, so switching a block into edit
// mode doesn't shift the layout.
export const roomyBoxStyle = /** @type {React.CSSProperties} */ ({
  padding: `8px ${ROOMY_INSET}px`,
  marginLeft: -ROOMY_INSET,
  marginRight: -ROOMY_INSET,
});

/**
 * @param {{ display: string, roomy: boolean, highlight: boolean, hovered: boolean, accent: string }} args
 * @returns {React.CSSProperties}
 */
export function regionBoxStyle({ display, roomy, highlight, hovered, accent }) {
  return {
    position: "relative",
    display,
    boxShadow: highlight ? ringActive(accent) : hovered ? RING_HOVER : "none",
    backgroundColor: highlight ? bgActive(accent) : "transparent",
    borderRadius: RING_RADIUS,
    transition: "box-shadow 0.15s ease, background-color 0.2s ease",
    ...(roomy ? roomyBoxStyle : null),
  };
}

/**
 * Translucent ink + blur rather than a solid fill, so the chip reads lightly
 * over a bright page. On a roomy card it straddles the ring line (it sits in
 * the padding gap); on a tight region it floats fully above so it clears the
 * content.
 *
 * @param {{ roomy: boolean, highlight: boolean, accent: string, font: string }} args
 * @returns {React.CSSProperties}
 */
export function regionChipStyle({ roomy, highlight, accent, font }) {
  return {
    position: "absolute",
    top: 0,
    left: roomy ? 8 : 0,
    transform: roomy ? "translateY(-50%)" : "translateY(-100%)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    border: 0,
    borderRadius: 6,
    background: "color-mix(in srgb, var(--ins-bg, #1c1815) 82%, transparent)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: highlight ? accent : "var(--ins-text, #fff)",
    fontFamily: font,
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    cursor: "pointer",
    zIndex: 9999,
  };
}

/**
 * Dirty marker carried inside a chip; inherits the chip's colour so it tracks
 * the accent without a second rule.
 */
export const chipDirtyDotStyle = /** @type {React.CSSProperties} */ ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "currentColor",
  opacity: 0.9,
});
