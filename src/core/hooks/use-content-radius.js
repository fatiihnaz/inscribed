"use client";

/**
 * @file Reads the corner radius the consumer gave their own content, so the
 * edit ring can take the same shape.
 *
 * A ring is drawn as an `outline` on the wrapper, and the browser derives the
 * outline's corners from the wrapper's own `border-radius` plus the offset.
 * Match the wrapper to the content and the ring comes out concentric for free:
 * round around a circular avatar, square around a square photo.
 *
 * Computed style rather than the `style` prop, because the radius just as often
 * arrives from a class or a stylesheet.
 */

import { useLayoutEffect, useState } from "react";

const CORNERS = /** @type {const} */ ([
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
]);

/**
 * @param {{ current: HTMLElement | null }} ref  Wrapper holding the content.
 * @param {boolean} enabled
 * @returns {string | null}  A `border-radius` value, or null until measured.
 */
export function useContentRadius(ref, enabled) {
  const [radius, setRadius] = useState(/** @type {string | null} */ (null));

  useLayoutEffect(() => {
    // Left as it was rather than cleared: the geometry a hidden ring would have
    // matched has not moved, and clearing costs a render on every hover-out.
    if (!enabled) return undefined;
    const measure = () => {
      // The wrapper also holds our own chrome, which is marked so it cannot be
      // mistaken for the content: a drag renders its landing marker first.
      const content = ref.current?.querySelector(":scope > *:not([data-ins-chrome])");
      if (!content) return;
      const style = getComputedStyle(content);
      const corners = CORNERS.map((corner) => style[corner]);
      setRadius(corners.every((c) => c === corners[0]) ? corners[0] : corners.join(" "));
    };
    measure();
    // A percentage radius resolves against the box, so a resize changes it.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, enabled]);

  return radius;
}
