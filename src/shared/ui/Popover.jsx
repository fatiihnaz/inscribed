"use client";

/**
 * @file A panel anchored to a trigger, rendered through a portal.
 *
 * The portal is not decoration: the drawer scrolls and its cards clip their own
 * content, so a panel positioned inside the card gets cut off the moment it is
 * taller than the row. Rendering to `document.body` at `position: fixed` and
 * re-measuring on scroll keeps it whole and still glued to its trigger. Same
 * approach the inline rich-text toolbar already uses.
 *
 * Closing is the caller's business (`onClose`); this only reports the two
 * gestures that mean "done": a pointer outside both trigger and panel, and
 * Escape.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { anchorPosition } from "./anchor-position.js";
import { panelVariants } from "./panel-motion.js";

// Above the drawer, which already sits near the top of the stack.
const Z = 2147483000;

/** @param {*} a @param {*} b */
function samePos(a, b) {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.flipped === b.flipped;
}

/**
 * @param {{
 *   anchorRef: { current: HTMLElement | null },
 *   open: boolean,
 *   onClose: () => void,
 *   matchWidth?: boolean,
 *   maxHeight?: number,
 *   children: React.ReactNode,
 * }} props
 *   `matchWidth` pins the panel to the trigger's width, which is what a field
 *   control wants; a calendar sizes itself instead.
 */
export function Popover({ anchorRef, open, onClose, matchWidth, maxHeight = 300, children }) {
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [pos, setPos] = useState(/** @type {{top: number, left: number, width: number, flipped: boolean} | null} */ (null));

  // Measured rather than CSS-anchored so the panel can flip above the trigger
  // when the viewport has no room below it.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const place = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const next = anchorPosition({
        anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        panel: {
          width: matchWidth ? rect.width : (panelRef.current?.offsetWidth ?? 0),
          height: panelRef.current?.offsetHeight ?? 0,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        maxHeight,
      });
      // Scrolling and resizing fire far more often than the panel actually
      // moves, and a fresh object would re-render on every one of them.
      setPos((prev) => (prev && samePos(prev, next) ? prev : next));
    };
    place();
    // Capture phase: the drawer's own scroll container has to move it too, not
    // just the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // A panel that grows or shrinks may no longer fit below its trigger. This
    // watches the panel itself rather than re-running on every render: `children`
    // is a new element object each time its parent renders, so depending on it
    // made an unrelated hover force a synchronous layout read and a second
    // render pass.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (ro && panelRef.current) ro.observe(panelRef.current);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [open, anchorRef, matchWidth, maxHeight]);

  useEffect(() => {
    if (!open) return undefined;
    /** @param {MouseEvent} e */
    const onDown = (e) => {
      const target = /** @type {Node} */ (e.target);
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="popover"
          ref={panelRef}
          // The panel's own sections inherit these state names, which is what
          // drives the staggered assembly inside it. See `panel-motion.js`.
          variants={panelVariants}
          custom={pos?.flipped}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position: "fixed",
            // Mounted but parked off-screen until the first measurement lands.
            // It has to be in the DOM for that measurement to read a real size
            // (a calendar sizes itself rather than matching the trigger), so
            // withholding it until `pos` exists would measure an absent panel
            // as zero-height, place it against that, and visibly correct one
            // frame later.
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: matchWidth ? pos?.width : undefined,
            maxHeight,
            visibility: pos ? "visible" : "hidden",
            zIndex: Z,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
