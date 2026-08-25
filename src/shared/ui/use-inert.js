"use client";

/**
 * @file Keeping a hidden subtree out of the tab order.
 *
 * The panel hides things by making them zero-height or by sliding them off
 * screen, never by unmounting: a collapsed card keeps its editor's state, and
 * the drawer keeps its whole column. Neither `height: 0; overflow: hidden` nor
 * a transform takes what is inside out of the tab order, though, so a shut card
 * still swallows focus and the caret lands somewhere nobody can see.
 *
 * `aria-hidden` alone does not fix it (it only hides from assistive tech, and a
 * focusable element inside an `aria-hidden` subtree is itself invalid), and
 * walking the subtree to set `tabindex="-1"` misses clicks.
 */

import { useEffect, useRef } from "react";

/**
 * Ref for the element to switch on and off.
 *
 * Written as a DOM attribute rather than a JSX prop because React 18 and 19
 * type `inert` differently and the SDK builds against both.
 *
 * @param {boolean} inert
 * @returns {React.RefObject<*>}
 */
export function useInert(inert) {
  const ref = useRef(/** @type {*} */ (null));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inert) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [inert]);
  return ref;
}

/**
 * The same switch as a callback ref, for the one place a hook cannot go: a row
 * rendered inside a `.map()`.
 *
 * @param {boolean} inert
 */
export const inertRef = (inert) => (/** @type {*} */ el) => {
  el?.toggleAttribute("inert", inert);
};
