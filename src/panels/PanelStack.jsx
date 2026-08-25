"use client";

/**
 * @file A panel's view stack: the drill-down the collections area does, offered
 * to a custom panel.
 *
 * The idea it rests on is that **the stack and the header path are the same
 * thing**. A panel that has already said which views are open has said where
 * the user is, so asking it to describe a breadcrumb separately would be asking
 * for the same fact twice. Push a view and the header grows a crumb; pop it and
 * the crumb goes with it.
 *
 * State stays with the panel. This renders what it is given and reports the
 * user's intent back through `onBack`; it never decides what is open, because
 * only the panel knows how its own views are keyed.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsPanel } from "./context.js";
import {
  DRILL_TRANSITION, DRILL_PARALLAX, DRILL_PANE_TRANSITION,
} from "../shared/style/drill-motion.js";
import { BG, HAIRLINE } from "../shared/style/tokens.js";

/**
 * @typedef {Object} PanelStackView
 * @property {string} key    Identity of the view; what the animation follows.
 * @property {string} label  Its crumb in the drawer's header path.
 * @property {React.ReactNode} node
 */

/**
 * @param {{
 *   views: (PanelStackView | false | null | undefined)[],
 *   onBack?: (toIndex: number) => void,
 * }} props
 *   Falsy entries are skipped, so a conditional view can be written inline
 *   (`open && { … }`) rather than assembled beforehand.
 *
 *   `onBack` is called with the depth the user asked for: 0 is the root view.
 *   A two-level panel can ignore the argument.
 */
export function PanelStack({ views, onBack }) {
  const { setCrumbs } = useCmsPanel();
  const stack = /** @type {PanelStackView[]} */ (views.filter(Boolean));

  // Read through a ref so an inline `onBack={() => ...}` (which is how it is
  // usually written) does not count as a change: the trail would otherwise be
  // republished on every render of the panel, waking the drawer each time.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // The trail is derived, so it is republished when the shape or the wording of
  // the stack moves, and not otherwise.
  const signature = stack.map((view) => `${view.key} ${view.label}`).join("");
  useEffect(() => {
    setCrumbs(
      stack.map((view, i) => ({
        label: view.label,
        // The last crumb is where you already are; the rest ask the panel to
        // come back out to that depth.
        onClick: i === stack.length - 1 ? undefined : () => onBackRef.current?.(i),
      })),
    );
    // Only on the way out: leaving the trail behind would have the header
    // describing a panel that is no longer mounted.
    return () => setCrumbs(null);
    // `stack` is rebuilt every render; `signature` is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, setCrumbs]);

  return (
    <section style={frameStyle}>
      {/* `initial={false}`: a panel that opens already deep (or comes back from
          another rail area still deep) must not replay its way in. Views added
          after mount still animate, since those are children arriving. */}
      <AnimatePresence initial={false}>
        {stack.map((view, i) => {
          const depth = stack.length - 1 - i;
          return (
            <motion.div
              key={view.key}
              initial={{ x: "-100%" }}
              animate={
                depth === 0
                  ? { x: "0%", opacity: 1 }
                  // One layer down recedes and dims; anything deeper is behind
                  // an opaque pane already, so it only has to stay out of the way.
                  : { x: DRILL_PARALLAX, opacity: depth === 1 ? 0.4 : 0 }
              }
              exit={{ x: "-100%", opacity: 0 }}
              transition={depth === 0 ? DRILL_PANE_TRANSITION : DRILL_TRANSITION}
              style={{
                ...(i === 0 ? rootLayerStyle : paneLayerStyle),
                // The covering pane is opaque at rest, so this only matters for
                // the transition frames, where the layer underneath is still on
                // screen and would otherwise take the click.
                pointerEvents: depth === 0 ? "auto" : "none",
              }}
              aria-hidden={depth !== 0}
            >
              {view.node}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}

const frameStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
});

// Each layer scrolls on its own, so drilling in does not carry the list's
// scroll position into the detail view.
const layerBase = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
});

const rootLayerStyle = /** @type {React.CSSProperties} */ ({
  ...layerBase,
  willChange: "transform, opacity",
});

// Opaque, because it covers the layer below rather than blending with it.
// Same edge and cast shadow the collections pane carries, so drilling into a
// panel and drilling into a collection produce the same object.
const paneLayerStyle = /** @type {React.CSSProperties} */ ({
  ...layerBase,
  background: BG,
  boxShadow: `1px 0 0 ${HAIRLINE}, 16px 0 36px rgba(0, 0, 0, 0.35)`,
  willChange: "transform",
});
