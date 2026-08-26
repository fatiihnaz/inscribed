/**
 * @file Where a floating panel goes relative to its trigger.
 *
 * Pure arithmetic, deliberately separated from the DOM reads in `Popover`: the
 * measuring is trivial and the placement is not, so this is the half worth
 * testing. Everything arrives as plain numbers.
 */

export const ANCHOR_GAP = 6;
export const VIEWPORT_MARGIN = 8;

/**
 * @typedef {Object} AnchorRect
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} width
 *
 * @typedef {Object} PanelSize
 * @property {number} width
 * @property {number} height   0 when the panel has not been measured yet.
 *
 * @typedef {Object} Viewport
 * @property {number} width
 * @property {number} height
 */

/**
 * Place the panel under its trigger, or above it when the space below cannot
 * hold it and the space above is larger. Horizontally it starts at the
 * trigger's left edge and is pulled back inside the viewport if that would
 * overflow.
 *
 * @param {{
 *   anchor: AnchorRect,
 *   panel: PanelSize,
 *   viewport: Viewport,
 *   maxHeight: number,
 *   gap?: number,
 *   margin?: number,
 * }} args
 * @returns {{ top: number, left: number, width: number, flipped: boolean }}
 */
export function anchorPosition({ anchor, panel, viewport, maxHeight, gap = ANCHOR_GAP, margin = VIEWPORT_MARGIN }) {
  // An unmeasured panel is assumed to want its full allowance, so the first
  // frame flips when it is going to need to rather than after the editor has
  // already seen it clipped.
  const needed = Math.min(panel.height || maxHeight, maxHeight);

  const roomBelow = viewport.height - anchor.bottom - margin;
  const roomAbove = anchor.top - margin;
  const flipped = roomBelow < needed && roomAbove > roomBelow;

  const top = flipped
    ? Math.max(margin, anchor.top - (panel.height || needed) - gap)
    : anchor.bottom + gap;

  // The panel is as wide as the trigger when it is matching it, so that is the
  // width to keep on screen.
  const width = panel.width || anchor.width;
  const left = Math.min(
    Math.max(margin, anchor.left),
    Math.max(margin, viewport.width - width - margin),
  );

  return { top, left, width: anchor.width, flipped };
}
