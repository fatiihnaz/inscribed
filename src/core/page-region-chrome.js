/**
 * @file Shared chrome for the page-side edit affordances: `EditableRegion` and
 * `CollectionItem`.
 *
 * Both draw the same hover ring, the same halo around block-level content, and
 * the same label chip; only the accent differs (content accent vs collection
 * accent). This lives in one place on purpose: the two kept their own copies
 * once and drifted, leaving the collection wrapper on an older chip that
 * neither straddled the ring nor was clickable.
 *
 * Every affordance here is painted outside the content box (outline +
 * box-shadow spread), never with padding: entering admin mode must not reflow
 * the page, so an admin sees the published layout pixel for pixel.
 */

import {
  BORDER, DUR_FAST, EASE, FONT_MONO, FONT_SANS, FS_2XS, FS_XS,
  R_MD, R_SM, RING_RADIUS, ROOMY_INSET,
} from "../shared/style/tokens.js";

/** Tags that make a region block-level, which is what earns it the full halo. */
export const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header", "footer", "nav",
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "figure", "figcaption", "table", "form", "pre", "address", "hgroup", "dl",
]);

// Hover shows a neutral line ring; selecting switches to the accent ring plus a
// faint tint (hover -> select hierarchy).
export const RING_LINE = "rgba(127, 127, 127, 0.55)";

/** @param {string} accent */
export const bgActive = (accent) => `color-mix(in srgb, ${accent} 5%, transparent)`;

/**
 * How far the ring and tint reach outside the content box.
 *
 * @param {boolean} roomy
 */
export const haloInset = (roomy) => (roomy ? ROOMY_INSET : 2);

/**
 * Stacking level for a region whose chrome is showing. The ring is the
 * wrapper's own outline, painted outside its box, so a sibling that paints
 * later covers it; unlike the chip, it cannot float out on a z-index of its
 * own. Applied only while hovered or selected, so a resting region never
 * creates a stacking context the host page did not ask for. Below the drawer
 * (9998) and the chip (9999).
 */
export const CHROME_LIFT_Z = 9997;

/**
 * @param {{
 *   display: string, roomy: boolean, highlight: boolean, hovered: boolean,
 *   accent: string, radius?: string | number | null,
 * }} args
 * @returns {React.CSSProperties}
 */
export function regionBoxStyle({ display, roomy, highlight, hovered, accent, radius }) {
  const inset = haloInset(roomy);
  const tint = bgActive(accent);
  return {
    position: "relative",
    zIndex: highlight || hovered ? CHROME_LIFT_Z : undefined,
    display,
    outline: `${highlight ? 1.5 : 1}px solid ${highlight ? accent : hovered ? RING_LINE : "transparent"}`,
    outlineOffset: inset,
    backgroundColor: highlight ? tint : "transparent",
    // Carries the tint across the gap to the ring, so the two read as one card
    // rather than a fill with a detached outline around it.
    boxShadow: highlight ? `0 0 0 ${inset}px ${tint}` : "none",
    // The browser derives the outline's corners from this plus the offset, so
    // handing it the content's own radius is what keeps the ring concentric.
    borderRadius: radius ?? RING_RADIUS,
    transition: "outline-color 0.15s ease, background-color 0.2s ease, box-shadow 0.2s ease",
  };
}

// Frosted glass. The fill has to stay thin for the page to actually read
// through it; the saturation boost is what keeps the colours behind it alive
// rather than washed to grey, which is most of what sells the effect.
//
// The fill sets the ramp everything on this surface uses, so it is not a free
// taste knob: 64% is the floor (below it TEXT_HI itself drops under 4.5:1 on a
// white page), and 68% keeps a little headroom while still reading as glass.
// Thickening or thinning it means checking the ramp again, not just this number.
export const INK_SURFACE = /** @type {React.CSSProperties} */ ({
  background: "color-mix(in srgb, var(--ins-bg, #1c1815) 68%, transparent)",
  backdropFilter: "blur(20px) saturate(200%)",
  WebkitBackdropFilter: "blur(20px) saturate(200%)",
});

// The lit edge every floating ink surface shares. Without the hairline the
// glass has no rim and melts into a dark photograph; the inset highlight is the
// light catching its top edge, and the drop shadow lifts it off a bright page.
export const INK_EDGE = /** @type {React.CSSProperties} */ ({
  border: `1px solid ${BORDER}`,
  boxShadow: [
    `inset 0 1px 0 color-mix(in srgb, var(--ins-surface, #fff) 16%, transparent)`,
    "0 4px 14px -6px rgba(0, 0, 0, 0.5)",
    "0 1px 2px rgba(0, 0, 0, 0.2)",
  ].join(", "),
});

// One control size for the whole page-side chrome. A row of buttons has to hold
// a full control; the chip holds one line of 10px type, so it gets its own
// height rather than sitting inside a half-empty pill.
const PILL_PAD = 2;
const CHIP_HEIGHT = 20;

/** Height of one control, and the icon that sits in it. */
export const CHROME_CONTROL = 18;
export const CHROME_ICON = 12;
export const CHROME_STROKE = 1.75;

const PILL_HEIGHT = CHROME_CONTROL + 2 * PILL_PAD + 2; // + the hairline, top and bottom

/**
 * The pill a row of page-side actions is drawn on, minus its anchoring, so the
 * on-image overlay can reuse the shape without the ring-line placement.
 */
export const inkRowStyle = /** @type {React.CSSProperties} */ ({
  ...INK_SURFACE,
  ...INK_EDGE,
  boxSizing: "border-box",
  height: PILL_HEIGHT,
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  padding: PILL_PAD,
  borderRadius: R_MD,
});

/** Separates an irreversible action from the rest of a row. */
export const inkDividerStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 0 auto",
  width: 1,
  height: 12,
  margin: "0 3px",
  background: BORDER,
});

/**
 * Where a pill sits relative to the region's ring.
 *
 * Straddling centres it on the ring line, which is what makes the line look
 * like it runs through the pill rather than under it. Not straddling stacks it
 * on top of the content instead: the right call for inline text, where half a
 * pill would land on the sentence being edited.
 *
 * Either way the pill must touch the content box. It is a child, so hover
 * survives the pointer's trip onto it only while the two stay contiguous, which
 * is why the non-straddling case anchors at 0 rather than at the ring.
 *
 * @param {boolean} roomy
 * @param {boolean} straddle
 */
const floatOnRing = (roomy, straddle) => ({
  position: /** @type {const} */ ("absolute"),
  top: straddle ? -haloInset(roomy) : 0,
  transform: straddle ? "translateY(-50%)" : "translateY(-100%)",
  zIndex: 9999,
});

/**
 * The label chip: a real button, not a decorative tag. Mono, because what it
 * carries is a block path: a literal identifier, the one thing the type ramp
 * reserves the mono face for.
 *
 * @param {{
 *   roomy: boolean, highlight: boolean, accent: string, straddle?: boolean,
 * }} args
 * @returns {React.CSSProperties}
 */
export function regionChipStyle({ roomy, highlight, accent, straddle = roomy }) {
  return /** @type {React.CSSProperties} */ ({
    ...floatOnRing(roomy, straddle),
    ...INK_SURFACE,
    ...INK_EDGE,
    boxSizing: "border-box",
    left: 0,
    height: CHIP_HEIGHT,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "0 7px",
    borderRadius: R_MD,
    color: highlight ? accent : "var(--ins-text, #fff)",
    fontFamily: FONT_MONO,
    fontSize: FS_2XS,
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
    "--ins-ink-fg": accent,
  });
}

/**
 * Row of per-region actions, anchored opposite the label chip so a region
 * carrying both reads as one line rather than two stacked pills.
 *
 * @param {{ roomy: boolean, straddle?: boolean }} args
 * @returns {React.CSSProperties}
 */
export function regionActionsStyle({ roomy, straddle = roomy }) {
  return {
    ...floatOnRing(roomy, straddle),
    ...inkRowStyle,
    right: 0,
  };
}

/**
 * One button inside `inkRowStyle`. Ink comes from the row behind it, so the
 * button itself stays transparent; the accent travels to the injected sheet as
 * a custom property, which is what tints its hover wash.
 *
 * Sans, not mono: labels and counts are prose, and the mono face is spoken for
 * (see `regionChipStyle`).
 *
 * @param {{ accent?: string, disabled?: boolean, iconOnly?: boolean }} args
 * @returns {React.CSSProperties}
 */
export function regionActionButtonStyle({ accent, disabled, iconOnly }) {
  const fg = accent ?? "var(--ins-text, #fff)";
  return /** @type {React.CSSProperties} */ ({
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: CHROME_CONTROL,
    width: iconOnly ? CHROME_CONTROL : undefined,
    padding: iconOnly ? 0 : "0 8px",
    border: 0,
    borderRadius: R_SM,
    background: "transparent",
    color: fg,
    fontFamily: FONT_SANS,
    fontSize: FS_XS,
    fontWeight: 500,
    letterSpacing: "0.01em",
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    "--ins-ink-fg": fg,
  });
}

// Hover, press and focus rings can't be expressed inline, so they live in one
// sheet injected on first admin render (the same trick `RichTextToolbar` uses).
export const INK_BTN_CLASS = "ins-ink-btn";
export const INK_CHIP_CLASS = "ins-ink-chip";

let inkStyleInjected = false;

/** Idempotent; safe to call from every surface that draws this chrome. */
export function ensureInkChromeStyle() {
  if (inkStyleInjected || typeof document === "undefined") return;
  inkStyleInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-inscribed-ink-chrome", "");
  // `!important` throughout: the pill fills are inline (they carry the blur),
  // and an inline background outranks any class rule without it.
  el.textContent = `
    .${INK_BTN_CLASS}, .${INK_CHIP_CLASS} {
      transition: background-color ${DUR_FAST} ${EASE},
                  border-color ${DUR_FAST} ${EASE},
                  opacity ${DUR_FAST} ${EASE};
    }
    .${INK_BTN_CLASS}:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ins-ink-fg, #fff) 18%, transparent) !important;
    }
    .${INK_BTN_CLASS}:active:not(:disabled) {
      background: color-mix(in srgb, var(--ins-ink-fg, #fff) 28%, transparent) !important;
    }
    .${INK_CHIP_CLASS}:hover {
      border-color: color-mix(in srgb, var(--ins-surface, #fff) 22%, transparent) !important;
    }
    .${INK_BTN_CLASS}:focus-visible, .${INK_CHIP_CLASS}:focus-visible {
      outline: 1.5px solid var(--ins-ink-fg, currentColor);
      outline-offset: -1.5px;
    }
  `;
  document.head.appendChild(el);
}

/**
 * Dirty marker carried inside a chip; inherits the chip's colour so it tracks
 * the accent without a second rule.
 */
export const chipDirtyDotStyle = /** @type {React.CSSProperties} */ ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "currentColor",
  opacity: 0.9,
});
