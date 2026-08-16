/**
 * @file Shared chrome for the page-side edit affordances: `EditableRegion` and
 * `CollectionItem`.
 *
 * Both draw the same hover ring, the same halo around block-level content, and
 * the same label chip; only the accent differs (content accent vs collection
 * accent). This lives in one place on purpose: the two kept their own copies
 * once and drifted, leaving the collection wrapper on an older chip that
 * neither straddled the ring nor was clickable.
 *
 * Every affordance here is painted outside the content box (outline +
 * box-shadow spread), never with padding: entering admin mode must not reflow
 * the page, so an admin sees the published layout pixel for pixel.
 */

import { ROOMY_INSET, RING_RADIUS } from "../shared/style/tokens.js";

/** Tags that make a region block-level, which is what earns it the full halo. */
export const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header", "footer", "nav",
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "figure", "figcaption", "table", "form", "pre", "address", "hgroup", "dl",
]);

// Hover shows a neutral line ring; selecting switches to the accent ring plus a
// faint tint (hover -> select hierarchy).
export const RING_LINE = "rgba(127, 127, 127, 0.55)";

/** @param {string} accent */
export const bgActive = (accent) => `color-mix(in srgb, ${accent} 5%, transparent)`;

/**
 * How far the ring and tint reach outside the content box.
 *
 * @param {boolean} roomy
 */
export const haloInset = (roomy) => (roomy ? ROOMY_INSET : 2);

/**
 * @param {{ display: string, roomy: boolean, highlight: boolean, hovered: boolean, accent: string }} args
 * @returns {React.CSSProperties}
 */
export function regionBoxStyle({ display, roomy, highlight, hovered, accent }) {
  const inset = haloInset(roomy);
  const tint = bgActive(accent);
  return {
    position: "relative",
    display,
    outline: `${highlight ? 1.5 : 1}px solid ${highlight ? accent : hovered ? RING_LINE : "transparent"}`,
    outlineOffset: inset,
    backgroundColor: highlight ? tint : "transparent",
    // Carries the tint across the gap to the ring, so the two read as one card
    // rather than a fill with a detached outline around it.
    boxShadow: highlight ? `0 0 0 ${inset}px ${tint}` : "none",
    borderRadius: RING_RADIUS,
    transition: "outline-color 0.15s ease, background-color 0.2s ease, box-shadow 0.2s ease",
  };
}

// Translucent ink + blur rather than a solid fill, so anything floating on the
// ring line reads lightly over a bright page.
const INK_SURFACE = /** @type {React.CSSProperties} */ ({
  background: "color-mix(in srgb, var(--ins-bg, #1c1815) 82%, transparent)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
});

// A roomy region's row straddles the halo's top line; a tight one's clears the
// content entirely. Either way the row must touch the content box: it is a
// child, so hover survives the trip onto it only while the two stay contiguous.
const floatOnRing = (roomy) => ({
  position: /** @type {const} */ ("absolute"),
  top: roomy ? -haloInset(roomy) : 0,
  transform: roomy ? "translateY(-50%)" : "translateY(-100%)",
  zIndex: 9999,
});

/**
 * The label chip: a real button, not a decorative tag.
 *
 * @param {{ roomy: boolean, highlight: boolean, accent: string, font: string }} args
 * @returns {React.CSSProperties}
 */
export function regionChipStyle({ roomy, highlight, accent, font }) {
  return {
    ...floatOnRing(roomy),
    ...INK_SURFACE,
    left: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    border: 0,
    borderRadius: 6,
    color: highlight ? accent : "var(--ins-text, #fff)",
    fontFamily: font,
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

/**
 * Row of per-region actions, anchored opposite the label chip so a region
 * carrying both reads as one line rather than two stacked pills.
 *
 * @param {{ roomy: boolean }} args
 * @returns {React.CSSProperties}
 */
export function regionActionsStyle({ roomy }) {
  return {
    ...floatOnRing(roomy),
    ...INK_SURFACE,
    right: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 2,
    borderRadius: 6,
  };
}

/**
 * One button inside `regionActionsStyle`. Ink comes from the row behind it, so
 * the button itself stays transparent.
 *
 * @param {{ font: string, accent?: string, disabled?: boolean }} args
 * @returns {React.CSSProperties}
 */
export function regionActionButtonStyle({ font, accent, disabled }) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "2px 6px",
    border: 0,
    borderRadius: 4,
    background: "transparent",
    color: accent ?? "var(--ins-text, #fff)",
    fontFamily: font,
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
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
