"use client";

/**
 * @file `useImageOverlayFits`: does a picture have room for the on-image
 * overlay's scrim buttons? Below the threshold they crowd the image, so the
 * caller stands the overlay down and editing falls back to the label chip and
 * the drawer.
 *
 * Shared by `<EditableRegion>`'s Image blocks and `<CollectionField>`'s Image
 * fields so the two agree on where that line is.
 */

import { useEffect, useState } from "react";

// Below this the replace/remove buttons don't fit over the picture.
const MIN = { w: 150, h: 64 };

/**
 * @param {{ current: HTMLElement | null }} ref  Box to measure (the wrapper the overlay anchors to).
 * @param {boolean} enabled  False skips the observer entirely, for the many cases with no overlay to place.
 * @returns {boolean}
 */
export function useImageOverlayFits(ref, enabled) {
  const [size, setSize] = useState(/** @type {{ w: number, h: number } | null} */ (null));

  useEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);

  // Unmeasured (first paint, or no ResizeObserver): assume it fits rather than
  // hiding the picture's only in-place affordance.
  return !size || (size.w >= MIN.w && size.h >= MIN.h);
}
