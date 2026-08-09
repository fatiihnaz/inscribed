"use client";

/**
 * @file Something that grows into place and shrinks out of it, taking the
 * layout with it.
 *
 * The drawer had two of these written by hand (the conflict panel, the save
 * error banner) and both had landed on the same shape: fade the box, and let a
 * `layout` projection on a neighbour glide by however much height appeared.
 * That is two clocks for one gesture. Going in, the box reserved its full
 * height before the content faded up, so it read as a pop and then a fill.
 * Coming out, the fade finished, React removed the node a frame later, and
 * whatever sat below jumped rather than travelled.
 *
 * Here the element owns its own height, so everything around it moves by
 * ordinary reflow, in step, with nothing to keep in sync. It also means callers
 * stop reaching for `layout`, which is worth more than the animation: a
 * projection animates *every* positional delta, including the ones a route
 * change causes, and that is what had drawer cards sliding around on
 * navigation.
 *
 * The two nested elements are the part that matters. The outer one animates
 * height against `overflow: hidden`; the inner one is whatever the caller
 * passes, at its natural size. Animating a styled box directly is what squashed
 * the text on the way in, because the content reflowed at every intermediate
 * height instead of being clipped at one.
 */

import { AnimatePresence, motion } from "framer-motion";

import { PANEL_TRANSITION } from "../shared/style/tokens.js";

/**
 * Opacity is the shorter of the two on purpose. Going in the box opens and the
 * content has already settled inside it; coming out the content is gone before
 * the space finishes closing, so nothing ever looks squeezed.
 */
export const COLLAPSE_TRANSITION = {
  height: { duration: 0.26, ease: PANEL_TRANSITION.ease },
  opacity: { duration: 0.16, ease: "linear" },
};

/**
 * `initial={false}` so something already open when its surface mounts (what
 * reopening the drawer does) is simply there, rather than replaying.
 *
 * @param {{
 *   show: boolean,
 *   children: React.ReactNode,
 *   transition?: object,
 * }} props
 */
export function Collapse({ show, children, transition }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition ?? COLLAPSE_TRANSITION}
          style={clipStyle}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// `overflow: hidden` is what the height animates against, and it doubles as a
// block formatting context so a child's margin cannot escape upward and hold
// space open while this is shut. `flexShrink: 0` because the drawer's column
// would otherwise squeeze it instead of letting it size itself.
const clipStyle = /** @type {React.CSSProperties} */ ({
  overflow: "hidden",
  flexShrink: 0,
});
