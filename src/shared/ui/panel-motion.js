/**
 * @file The motion vocabulary every floating panel shares.
 *
 * Kept as framer variants rather than per-element props so a panel's sections
 * inherit the open/close state from the panel itself: `Popover` animates
 * "hidden" -> "visible" -> "exit", and anything inside tagged with
 * `staggerGroup` / `staggerItem` rides along without being told when to run.
 *
 * The cascade lands on a panel's structural blocks (header, body, footer), not
 * on its individual rows: staggering forty-two calendar cells reads as a
 * flicker, staggering three sections reads as the panel assembling itself.
 */

// A quint-style ease-out: most of the distance is covered early, so the panel
// arrives quickly and settles slowly.
export const PANEL_EASE = [0.22, 1, 0.36, 1];

/**
 * Takes the popover's flip state as framer `custom`, which is resolved when the
 * variant runs rather than when the element mounts: the panel is measured after
 * mount, so a mount-time value would still say "below" for a panel that ends up
 * above its trigger.
 */
export const panelVariants = {
  hidden: (/** @type {boolean} */ flipped) => ({ opacity: 0, scale: 0.95, y: flipped ? 8 : -8 }),
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: PANEL_EASE } },
  exit: (/** @type {boolean} */ flipped) => ({
    opacity: 0,
    scale: 0.95,
    y: flipped ? 4 : -4,
    transition: { duration: 0.15, ease: "easeIn" },
  }),
};

export const staggerGroup = {
  hidden: {},
  visible: { transition: { delayChildren: 0.05, staggerChildren: 0.05 } },
  // Reversed on the way out, so the panel folds back up from the bottom.
  exit: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 10, filter: "blur(2px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: 5, filter: "blur(2px)", transition: { duration: 0.15 } },
};

/**
 * Horizontal swap for a page of content, direction taken from framer `custom`.
 * Shared by the month grid and the picker's result list: both replace a whole
 * page at once, and sliding says which way you moved through it.
 */
export const slideVariants = {
  enter: (/** @type {number} */ dir) => ({ x: dir > 0 ? 25 : -25, opacity: 0 }),
  center: { x: 0, opacity: 1, zIndex: 1 },
  exit: (/** @type {number} */ dir) => ({ x: dir < 0 ? 25 : -25, opacity: 0, zIndex: 0 }),
};

/** Vertical swap between a panel's two faces (calendar <-> month list). */
export const faceVariants = {
  enter: (/** @type {boolean} */ up) => ({ y: up ? 24 : -24, opacity: 0, filter: "blur(4px)", scale: 0.98 }),
  center: {
    zIndex: 1,
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
  },
  exit: (/** @type {boolean} */ up) => ({
    zIndex: 0,
    y: up ? -24 : 24,
    opacity: 0,
    filter: "blur(4px)",
    scale: 0.98,
    transition: { duration: 0.2, ease: "easeIn" },
  }),
};
