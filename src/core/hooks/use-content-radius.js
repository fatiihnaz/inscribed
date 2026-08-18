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
 * Only content that paints a visible box gets measured. Content without one
 * reports a zero radius it never really had, and matching that put hard corners
 * on the ring around a bare list row.
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

const EDGES = /** @type {const} */ ([
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
]);

// Elements that paint their own content, so they are a box whatever their CSS
// says. An `<img>` is the case this hook was built for and carries no fill,
// border or shadow of its own.
const PAINTED_TAGS = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "SVG", "IFRAME"]);

/** Computed `backgroundColor` is `rgba(..., 0)` when nothing was set. */
const isTransparent = (color) => !color || color === "transparent" || /,\s*0\s*\)$/.test(color);

/**
 * Whether the content draws a box a visitor can see, which is the only thing
 * with a shape worth being concentric with. Text sits straight on the page, so
 * matching it means copying a zero radius and ringing a bare row with hard
 * corners, while the same text inside an `<EditableRegion>` keeps the house
 * radius: the mismatch this test exists to close.
 *
 * @param {Element} el
 * @param {CSSStyleDeclaration} style
 */
function paintsBox(el, style) {
  if (PAINTED_TAGS.has(el.tagName.toUpperCase())) return true;
  if (style.backgroundImage && style.backgroundImage !== "none") return true;
  if (style.boxShadow && style.boxShadow !== "none") return true;
  if (!isTransparent(style.backgroundColor)) return true;
  return EDGES.some((edge) => parseFloat(style[edge]) > 0);
}

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
      // Null, not the measured zero: a boxless item has no shape to match, so
      // it falls back to the house radius the way a text region does.
      if (!paintsBox(content, style)) {
        setRadius(null);
        return;
      }
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
