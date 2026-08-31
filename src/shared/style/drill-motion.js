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

/**
 * Stepping sideways between two peers at the same depth: one collection to the
 * next along the strip.
 *
 * Deliberately far shorter and far smaller than the drill above. The drill is a
 * change of place, this is a change of subject, and a lateral move that travels
 * as far as a drill reads as one, which tells the editor they went a level
 * deeper when they only stepped along.
 */
export const SWITCH_TRAVEL = 14;

export const SWITCH_TRANSITION = { duration: 0.19, ease: [0.32, 0.72, 0.18, 1] };

// The outgoing panel holds the collection being left, so it is cleared quickly
// and the arriving one gets the part you actually watch.
export const SWITCH_EXIT_TRANSITION = { duration: 0.11, ease: "linear" };

/**
 * The enter/exit props for swapping one collection's panel for another.
 *
 * Two gestures, because the panel is two different objects. On the side column
 * the strip runs left to right and the switch travels along it, which is what
 * says the editor stepped rather than descended. Docked as a bottom sheet there
 * is no such axis: the sheet's own gesture is vertical, the strip is the only
 * horizontal thing on screen, and a panel sliding sideways inside it reads as a
 * carousel fighting the sheet. Content arrives from below there, the same way
 * everything else on a sheet does, and it does not vary with direction: a sheet
 * has no left and right to have come from.
 *
 * Leaving never travels, on either axis. The collection being left has already
 * been decided against.
 *
 * @param {-1 | 1} direction  Along the strip. Ignored on a sheet.
 * @param {boolean} vertical  True while the panel is docked as a bottom sheet.
 */
export function switchMotion(direction, vertical) {
  return {
    initial: vertical
      ? { opacity: 0, y: SWITCH_TRAVEL }
      : { opacity: 0, x: direction * SWITCH_TRAVEL },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0 },
    transition: { ...SWITCH_TRANSITION, exit: SWITCH_EXIT_TRANSITION },
  };
}

/** The panel being swapped, while a switch is in flight. */
export const switchLayerStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  willChange: "transform, opacity",
});

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
