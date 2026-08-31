"use client";

/**
 * @file Which way a lateral switch travelled.
 *
 * Moving between two peers of a tab strip is sideways motion, not depth: the
 * drill-in already owns the "went inside" gesture, so a switch that replayed
 * it would say the user had gone a level deeper when they had only stepped
 * along. A slide in the strip's own direction says what actually happened, and
 * it needs to know which way that was.
 *
 * Here rather than beside the collections panel: that folder loads behind
 * `next/dynamic`, and the drawer shell reaches for this on every render.
 */

import { useState } from "react";

/**
 * `-1` when `to` sits before `from` in the strip, `1` otherwise.
 *
 * Unknown keys answer `1` rather than throwing: a collection can leave the
 * strip while it is open (a permission change, a page navigation), and a
 * missing neighbour is not a reason to refuse to animate.
 *
 * @param {string[]} order       Keys, in the order the strip lays them out.
 * @param {string | null} from
 * @param {string | null} to
 * @returns {-1 | 1}
 */
export function switchDirection(order, from, to) {
  if (!from || !to) return 1;
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1) return 1;
  return b < a ? -1 : 1;
}

/**
 * The direction of the most recent switch, updated in the same render the new
 * key arrives in.
 *
 * Deliberately not an effect: an effect settles after the frame that starts the
 * animation, so the first switch would play in whichever direction the previous
 * one went. Adjusting state during render is React's own answer to this, and it
 * re-renders before anything is committed.
 *
 * @param {string[]} order
 * @param {string | null} activeKey
 * @returns {-1 | 1}
 */
export function useSwitchDirection(order, activeKey) {
  const [seen, setSeen] = useState(/** @type {string | null} */ (activeKey));
  const [direction, setDirection] = useState(/** @type {-1 | 1} */ (1));

  if (activeKey !== seen) {
    setDirection(switchDirection(order, seen, activeKey));
    setSeen(activeKey);
  }

  return direction;
}
