/**
 * @file The drawer's drill-down gesture, as data: one layer recedes while the
 * next slides over it. Shared so a custom panel's view stack moves exactly like
 * the collections area does, without either one owning the other's markup.
 *
 * Values only, no React: both users drive them through framer-motion props.
 */

import { BG, HAIRLINE } from "./tokens.js";

/** Base timing for both layers, so the recede and the slide read as one move. */
export const DRILL_TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0.18, 1] };

/** How far the layer underneath travels while it recedes. */
export const DRILL_PARALLAX = "28%";

// The pane's cast shadow reaches ~52px past its own right edge, so at x=-100%
// the slide looks finished while the shadow still sits over the layer below;
// unmount then snaps it away. Fading only the tail of the exit clears the
// shadow with the pane instead, and keeps it fully opaque for the part you
// actually watch.
export const DRILL_PANE_TRANSITION = {
  ...DRILL_TRANSITION,
  opacity: { duration: 0.12, delay: 0.18, ease: "linear" },
};

/** The layer being covered. */
export const drillLayerStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  // Framer drives these transitions by writing inline transform/opacity each
  // frame, which does not promote the element on its own. Without a layer the
  // whole list repaints per frame instead of being composited.
  willChange: "transform, opacity",
});

/** The layer doing the covering. */
export const drillPaneStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: BG,
  // Right-edge hairline plus a soft cast shadow, so the entering pane separates
  // from the receding one.
  boxShadow: `1px 0 0 ${HAIRLINE}, 16px 0 36px rgba(0, 0, 0, 0.35)`,
  // The 36px blur above is the expensive part: promoted, it is rasterised once
  // and only moved afterwards. Scoped to while the pane is mounted.
  willChange: "transform",
});
