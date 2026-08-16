"use client";

/**
 * @file A button that opens its options underneath itself.
 *
 * Replaces the native `<select>` in the collection toolbar. A native dropdown
 * is drawn by the OS, so it arrives with its own font, its own metrics and its
 * own light popup inside a dark drawer: the one surface here that no amount of
 * CSS could bring into the design.
 *
 * The options come in on a stagger rather than as a block. The list is short
 * and the step is small, so it reads as the entries arriving in order, which is
 * also the order they are meant to be scanned in.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ChevronDown } from "../shared/style/icons.jsx";
import {
  BG_RAISED, COLLECTION_ACCENT, FONT_SANS, HAIRLINE,
  PANEL_TRANSITION, R_BADGE, R_SM, TEXT_MID, TEXT_MUTED,
} from "../shared/style/tokens.js";

const EASE = PANEL_TRANSITION.ease;

// Per-item step. Long enough to read as a sequence, short enough that the last
// entry of a typical list still lands inside the panel's own 180ms.
const STEP = 0.028;

const panelVariants = {
  hidden: { opacity: 0, y: -6, scaleY: 0.94 },
  shown: {
    opacity: 1, y: 0, scaleY: 1,
    transition: { duration: 0.18, ease: EASE, staggerChildren: STEP, delayChildren: 0.02 },
  },
  // Leaving, the stagger runs backwards and twice as fast: an exit that replays
  // the entrance at the same pace feels like the panel is reluctant to go.
  exit: {
    opacity: 0, y: -6, scaleY: 0.96,
    transition: { duration: 0.14, ease: EASE, staggerChildren: STEP / 2, staggerDirection: -1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -7 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.1, ease: "linear" } },
};

/**
 * @param {{
 *   value: string,
 *   options: { value: string, label: string }[],
 *   onChange: (next: string) => void,
 *   label: string,
 *   icon?: React.ReactNode,
 *   triggerStyle?: React.CSSProperties,
 * }} props
 */
export function Menu({ value, options, onChange, label, icon, triggerStyle }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const listRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const selected = options.find((opt) => opt.value === value);

  // Pointerdown, not click: a click that starts inside and ends outside (a drag
  // off a scrollbar) should not count as dismissing the panel.
  useEffect(() => {
    if (!open) return undefined;
    /** @param {PointerEvent} e */
    const onDown = (e) => {
      if (!rootRef.current?.contains(/** @type {Node} */ (e.target))) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus lands on the current option, so the arrows start from where the eye
  // already is rather than from the top of the list.
  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector("[data-selected='true']")
      ?? listRef.current?.firstElementChild;
    /** @type {HTMLElement | null} */ (el)?.focus({ preventScroll: true });
  }, [open]);

  const close = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  /** @param {React.KeyboardEvent} e */
  const onListKeyDown = (e) => {
    const items = [.../** @type {NodeListOf<HTMLElement>} */ (
      listRef.current?.querySelectorAll("[role='option']") ?? []
    )];
    const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Wraps, so holding one arrow cannot dead-end at either edge.
      items[(index + step + items.length) % items.length]?.focus({ preventScroll: true });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus({ preventScroll: true });
    } else if (e.key === "Tab") {
      close({ restoreFocus: false });
    }
  };

  return (
    <div ref={rootRef} style={rootStyle}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inscribed-btn-ghost"
        style={{ ...menuTriggerStyle, ...triggerStyle }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {icon}
        {/* Every option is laid into the same grid cell, so the cell is as wide
            as the longest one and the button never resizes on a pick. The panel
            matches this width and spends less of it on chrome than the trigger
            does (no chevron), so every label fits there too. */}
        <span style={sizerGridStyle}>
          {options.map((opt) => (
            <span key={opt.value} aria-hidden="true" style={sizerGhostStyle}>
              {opt.label}
            </span>
          ))}
          <span style={sizerLiveStyle}>{selected?.label ?? ""}</span>
        </span>
        <motion.span
          aria-hidden="true"
          style={chevronStyle}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <ChevronDown size={12} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={listRef}
            role="listbox"
            aria-label={label}
            variants={panelVariants}
            initial="hidden"
            animate="shown"
            exit="exit"
            onKeyDown={onListKeyDown}
            style={panelStyle}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <motion.div
                  key={opt.value}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  data-selected={isSelected}
                  variants={itemVariants}
                  onClick={() => {
                    onChange(opt.value);
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onChange(opt.value);
                    close();
                  }}
                  className="inscribed-menu-item"
                  style={{ ...itemStyle, ...(isSelected ? itemSelectedStyle : null) }}
                >
                  {opt.label}
                </motion.div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const rootStyle = /** @type {React.CSSProperties} */ ({
  position: "relative",
  display: "inline-flex",
  minWidth: 0,
});

// Line height 1.4, not 1: the label box is only as tall as its line, so a flat
// 1 clips every descender ("Slug" loses the tail of its g).
const menuTriggerStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 24,
  padding: "0 6px 0 8px",
  border: 0,
  borderRadius: R_SM,
  color: TEXT_MID,
  font: `500 11px/1.4 ${FONT_SANS}`,
  cursor: "pointer",
});

const sizerGridStyle = /** @type {React.CSSProperties} */ ({
  display: "grid",
  alignItems: "center",
});

const sizerGhostStyle = /** @type {React.CSSProperties} */ ({
  gridArea: "1 / 1",
  visibility: "hidden",
  whiteSpace: "nowrap",
});

const sizerLiveStyle = /** @type {React.CSSProperties} */ ({
  gridArea: "1 / 1",
  justifySelf: "start",
  whiteSpace: "nowrap",
});

const chevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  flexShrink: 0,
  color: TEXT_MUTED,
});

// `scaleY` needs a top origin or the panel grows from its middle, which reads
// as a zoom rather than as something unfolding from the button.
const panelStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  top: "calc(100% + 4px)",
  // Pinned to both edges, so the panel is exactly the trigger's width rather
  // than sizing itself and hanging past it.
  left: 0,
  right: 0,
  zIndex: 40,
  transformOrigin: "top center",
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: 3,
  background: BG_RAISED,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: R_SM,
  boxShadow: "0 10px 28px -10px rgba(0, 0, 0, 0.6), 0 2px 6px -2px rgba(0, 0, 0, 0.35)",
});

const itemStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  height: 24,
  padding: "0 7px",
  borderRadius: R_BADGE,
  color: TEXT_MID,
  font: `500 11px/1.4 ${FONT_SANS}`,
  cursor: "pointer",
  outline: "none",
  whiteSpace: "nowrap",
});

const itemSelectedStyle = /** @type {React.CSSProperties} */ ({
  color: COLLECTION_ACCENT,
});

