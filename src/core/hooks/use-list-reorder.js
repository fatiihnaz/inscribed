"use client";

/**
 * @file Pointer-driven reordering for an admin `<EditableList>`.
 *
 * The list does not own its container, so nothing about the layout can be
 * assumed: the drop axis and the slot positions are measured from the items'
 * own boxes, once, at pickup.
 *
 * Nothing moves in the DOM until the drop. The picked-up card and the cards it
 * displaces are positioned with `transform`, driven by CSS custom properties
 * the pointer handler writes directly. React only hears about the two moments
 * that are decisions: a drag started, and it landed.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const EDGE_ZONE = 72;
const EDGE_SPEED = 18;

export const SETTLE_MS = 180;
export const SHIFT_MS = 200;

/** @typedef {{ left: number, top: number, width: number, height: number }} Box */
/** @typedef {{ dx: number, dy: number }} Offset */
/** @typedef {{ vy: number, raf: number, container: HTMLElement | null }} ScrollState */

const VAR_X = "--ins-shift-x";
const VAR_Y = "--ins-shift-y";
const VAR_LANDING_X = "--ins-landing-x";
const VAR_LANDING_Y = "--ins-landing-y";

// Constant strings on purpose: React writes these once per drag and the live
// values live in the variables, so a re-render can never clobber them.
export const SHIFT_TRANSFORM = `translate3d(var(${VAR_X}, 0px), var(${VAR_Y}, 0px), 0)`;

/** Pins the landing marker to its slot while the card around it follows the pointer. */
export const LANDING_TRANSFORM =
  `translate3d(calc(var(${VAR_LANDING_X}, 0px) - var(${VAR_X}, 0px)),`
  + ` calc(var(${VAR_LANDING_Y}, 0px) - var(${VAR_Y}, 0px)), 0)`;

/**
 * @param {Box} a
 * @param {Box} b
 */
export function isHorizontalFlow(a, b) {
  return Math.abs(b.left - a.left) > Math.abs(b.top - a.top);
}

/**
 * An element's box in its `offsetParent`'s coordinates. Not
 * `getBoundingClientRect`, which reports the painted box and so picks up any
 * transform an in-flight animation has on it. Siblings share an `offsetParent`,
 * so these are comparable as they are.
 *
 * @param {HTMLElement} el
 * @returns {Box}
 */
export function layoutBox(el) {
  return {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/**
 * Where a neighbour sits, as a compass direction. Row membership comes from
 * vertical overlap rather than from the larger delta: in a two-column grid the
 * next card is both far to the left and one row down, and only "down" describes
 * the move honestly. Null when the boxes coincide, which is what an unrendered
 * list measures as and carries no direction at all.
 *
 * @param {Box} self
 * @param {Box} neighbour
 * @returns {"up" | "down" | "left" | "right" | null}
 */
export function neighbourDirection(self, neighbour) {
  const dx = neighbour.left - self.left;
  const dy = neighbour.top - self.top;
  if (dx === 0 && dy === 0) return null;
  const overlap = Math.min(self.top + self.height, neighbour.top + neighbour.height)
    - Math.max(self.top, neighbour.top);
  const sameRow = overlap > Math.min(self.height, neighbour.height) / 2;
  if (sameRow) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/**
 * @param {{ onReorder: (from: number, to: number) => void }} args
 */
export function useListReorder({ onReorder }) {
  const nodesRef = useRef(/** @type {Map<number, HTMLElement>} */ (new Map()));
  // Only the decisions: which card is held, and whether it has been released.
  // The slot under the pointer lives in `dragRef`, because nothing renders on it.
  const [drag, setDrag] = useState(/** @type {{ from: number, settling: boolean } | null} */ (null));
  const [suppress, setSuppress] = useState(false);
  const [flip, setFlip] = useState(/** @type {Map<number, Offset> | null} */ (null));
  const dragRef = useRef(/** @type {{ from: number, to: number, settling: boolean } | null} */ (null));
  const shiftsRef = useRef(/** @type {Map<number, Offset>} */ (EMPTY_SHIFTS));
  const boxesRef = useRef(/** @type {Box[]} */ ([]));
  const horizontalRef = useRef(false);
  const scrollRef = useRef(/** @type {ScrollState} */ ({ vy: 0, raf: 0, container: null }));
  const settleRef = useRef(0);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  /** @type {(index: number, el: HTMLElement | null) => void} */
  const registerNode = useCallback((index, el) => {
    if (el) nodesRef.current.set(index, el);
    else nodesRef.current.delete(index);
  }, []);

  // A drag that outlives its component would leave the page unselectable and
  // the commit hanging on a dead timer.
  useEffect(() => () => {
    stopAutoScroll(scrollRef.current);
    unlockPage();
    if (settleRef.current) clearTimeout(settleRef.current);
  }, []);

  /**
   * Animate a move the arrows or the position field have already decided. Call
   * it immediately before committing: it measures the boxes as they still are.
   *
   * @type {(from: number, to: number) => void}
   */
  const animateMove = useCallback((from, to) => {
    nodesRef.current.get(to)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    const inverses = flipInverses(snapshot(nodesRef.current), from, to);
    if (inverses.size === 0) return;
    setSuppress(true);
    setFlip(inverses);
  }, []);

  useLayoutEffect(() => {
    if (!flip) return undefined;
    // Two frames: the inverted position has to be painted before the release,
    // or the browser folds both into one and there is nothing left to animate.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setFlip(null);
        setSuppress(false);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [flip]);

  /**
   * `threshold` arms instead of starting, so the same element can still be
   * clicked: that is what lets a drawer card be its own handle without a grip.
   *
   * @type {(index: number, event: React.PointerEvent, options?: { threshold?: number }) => void}
   */
  const beginDrag = useCallback((index, event, options) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;

    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    const { pointerId } = event;
    const threshold = options?.threshold ?? 0;
    /** @type {((e: PointerEvent) => void) | null} */
    let onPointerMove = null;

    /**
     * @param {number} grabClientX
     * @param {number} grabClientY
     */
    const start = (grabClientX, grabClientY) => {
      const scroller = scrollParent(nodesRef.current.get(index));
      const origin = scrollOrigin(scroller);
      // Content space, and the origin is applied here and nowhere else: adding
      // it twice puts every box a scroll-height from the pointer, which reads
      // as "always the first gap".
      const boxes = snapshot(nodesRef.current, origin);
      if (boxes.length < 2 || !boxes[index]) return;

      boxesRef.current = boxes;
      horizontalRef.current = isHorizontalFlow(boxes[0], boxes[1]);
      scrollRef.current.container = scroller;
      handle.setPointerCapture(pointerId);
      lockPage();

      const grabX = grabClientX + origin.x;
      const grabY = grabClientY + origin.y;
      const held = nodesRef.current.get(index);
      writeLanding(held, landingOffset(boxes, index, index));
      dragRef.current = { from: index, to: index, settling: false };
      setDrag({ from: index, settling: false });

      onPointerMove = (e) => {
        const live = dragRef.current;
        if (!live || live.settling) return;
        const now = scrollOrigin(scroller);
        const contentX = e.clientX + now.x;
        const contentY = e.clientY + now.y;
        writeShift(nodesRef.current.get(live.from), contentX - grabX, contentY - grabY);

        const to = insertionSlot(boxesRef.current, contentX, contentY, horizontalRef.current);
        if (to !== live.to) {
          live.to = to;
          const next = slotShifts(boxesRef.current, live.from, to);
          applyShifts(nodesRef.current, shiftsRef.current, next);
          shiftsRef.current = next;
          writeLanding(nodesRef.current.get(live.from), landingOffset(boxesRef.current, live.from, to));
        }
        driveAutoScroll(scrollRef.current, e.clientY);
      };
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
    };

    /** @param {boolean} commit */
    const finish = (commit) => {
      if (onPointerMove) handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      stopAutoScroll(scrollRef.current);
      unlockPage();

      const state = dragRef.current;
      const nodes = nodesRef.current;
      const held = nodes.get(state?.from ?? -1);
      const wipe = () => {
        clearShift(held);
        for (const i of shiftsRef.current.keys()) clearShift(nodes.get(i));
        shiftsRef.current = EMPTY_SHIFTS;
        clearLanding(held);
      };

      if (!commit || !state) {
        wipe();
        dragRef.current = null;
        setDrag(null);
        return;
      }
      // Walk the card the rest of the way in, then commit: releasing straight
      // into the new array would jump it from the pointer to wherever it landed.
      const landing = landingOffset(boxesRef.current, state.from, state.to);
      state.settling = true;
      setDrag({ from: state.from, settling: true });
      writeShift(held, landing.dx, landing.dy);
      settleRef.current = window.setTimeout(() => {
        settleRef.current = 0;
        dragRef.current = null;
        wipe();
        setSuppress(true);
        setDrag(null);
        onReorderRef.current(state.from, state.to);
        requestAnimationFrame(() => requestAnimationFrame(() => setSuppress(false)));
      }, SETTLE_MS);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    if (threshold <= 0) {
      // Stops the press from becoming a text selection or a native image drag.
      event.preventDefault();
      start(event.clientX, event.clientY);
      return;
    }

    // Armed on the document: a fast flick can leave the handle before the
    // threshold is crossed, and a local listener would miss it.
    const armX = event.clientX;
    const armY = event.clientY;
    /** @param {PointerEvent} e */
    const onArmMove = (e) => {
      if (e.pointerId !== pointerId) return;
      if (Math.abs(e.clientX - armX) < threshold && Math.abs(e.clientY - armY) < threshold) return;
      disarm();
      start(e.clientX, e.clientY);
    };
    function disarm() {
      document.removeEventListener("pointermove", onArmMove);
      document.removeEventListener("pointerup", disarm);
      document.removeEventListener("pointercancel", disarm);
    }
    document.addEventListener("pointermove", onArmMove);
    document.addEventListener("pointerup", disarm);
    document.addEventListener("pointercancel", disarm);
  }, []);

  return { drag, flip, suppress, registerNode, beginDrag, animateMove };
}

/** @type {Map<number, Offset>} */
const EMPTY_SHIFTS = new Map();

/**
 * Writes only what changed. Crossing one slot boundary moves exactly one card
 * in or out of the displaced set, so this is a single style write per crossing
 * however long the list is.
 *
 * @param {Map<number, HTMLElement>} nodes
 * @param {Map<number, Offset>} prev
 * @param {Map<number, Offset>} next
 */
function applyShifts(nodes, prev, next) {
  for (const [index, offset] of next) {
    const old = prev.get(index);
    if (!old || old.dx !== offset.dx || old.dy !== offset.dy) {
      writeShift(nodes.get(index), offset.dx, offset.dy);
    }
  }
  // Back to zero rather than cleared, so a card that stops being displaced
  // slides home instead of snapping.
  for (const index of prev.keys()) {
    if (!next.has(index)) writeShift(nodes.get(index), 0, 0);
  }
}

/**
 * @param {HTMLElement | undefined} node
 * @param {number} dx
 * @param {number} dy
 */
function writeShift(node, dx, dy) {
  if (!node) return;
  node.style.setProperty(VAR_X, `${dx}px`);
  node.style.setProperty(VAR_Y, `${dy}px`);
}

/**
 * Cleared on release: index keys hand this node to another item later, and a
 * leftover offset would move the wrong card.
 *
 * @param {HTMLElement | undefined} node
 */
function clearShift(node) {
  if (!node) return;
  node.style.removeProperty(VAR_X);
  node.style.removeProperty(VAR_Y);
}

/**
 * @param {HTMLElement | undefined} node
 * @param {Offset} offset
 */
function writeLanding(node, offset) {
  if (!node) return;
  node.style.setProperty(VAR_LANDING_X, `${offset.dx}px`);
  node.style.setProperty(VAR_LANDING_Y, `${offset.dy}px`);
}

/** @param {HTMLElement | undefined} node */
function clearLanding(node) {
  if (!node) return;
  node.style.removeProperty(VAR_LANDING_X);
  node.style.removeProperty(VAR_LANDING_Y);
}

/**
 * Boxes of every registered item, in index order, shifted into the caller's
 * content space.
 *
 * @param {Map<number, HTMLElement>} nodes
 * @param {{ x: number, y: number }} [origin]
 * @returns {Box[]}
 */
function snapshot(nodes, origin = { x: 0, y: 0 }) {
  /** @type {[number, Box][]} */
  const entries = [];
  for (const [index, el] of nodes) {
    if (!el.isConnected) continue;
    const rect = el.getBoundingClientRect();
    entries.push([index, {
      left: rect.left + origin.x,
      top: rect.top + origin.y,
      width: rect.width,
      height: rect.height,
    }]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  return entries.map(([, box]) => box);
}

/**
 * The final index of an item dropped from `from` into slot `to`. Pulling it out
 * first shifts every later slot down one.
 *
 * @param {number} from
 * @param {number} to
 */
export function landingIndex(from, to) {
  return to > from ? to - 1 : to;
}

/**
 * @param {Box[]} boxes
 * @param {number} from
 * @param {number} to
 * @returns {Offset}
 */
export function landingOffset(boxes, from, to) {
  const source = boxes[from];
  const target = boxes[landingIndex(from, to)] ?? source;
  if (!source || !target) return { dx: 0, dy: 0 };
  return { dx: target.left - source.left, dy: target.top - source.top };
}

/**
 * The transforms that make a *finished* move look like it is about to happen.
 *
 * A move through the buttons changes the array outright, and index keys mean
 * the boxes stay put while their contents swap: nothing animates because, to
 * the browser, nothing moved. So each box that changed hands is offset to where
 * its new content used to sit, and released a frame later.
 *
 * @param {Box[]} boxes   Measured *before* the array changed.
 * @param {number} from
 * @param {number} to     Final index, not an insertion slot.
 * @returns {Map<number, Offset>}
 */
export function flipInverses(boxes, from, to) {
  /** @type {Map<number, Offset>} */
  const inverses = new Map();
  if (to === from) return inverses;
  const step = (seat, cameFrom) => {
    const self = boxes[seat];
    const origin = boxes[cameFrom];
    if (self && origin) inverses.set(seat, { dx: origin.left - self.left, dy: origin.top - self.top });
  };
  step(to, from);
  if (to > from) for (let k = from; k < to; k += 1) step(k, k + 1);
  else for (let k = from; k > to; k -= 1) step(k, k - 1);
  return inverses;
}

/**
 * Where each displaced item has to move so the gap opens at `to`.
 *
 * @param {Box[]} boxes
 * @param {number} from
 * @param {number} to
 * @returns {Map<number, Offset>}
 */
export function slotShifts(boxes, from, to) {
  /** @type {Map<number, Offset>} */
  const shifts = new Map();
  const step = (index, slot) => {
    const self = boxes[index];
    const target = boxes[slot];
    if (self && target) shifts.set(index, { dx: target.left - self.left, dy: target.top - self.top });
  };
  if (to > from + 1) {
    for (let i = from + 1; i < to; i += 1) step(i, i - 1);
  } else if (to < from) {
    for (let i = to; i < from; i += 1) step(i, i + 1);
  }
  return shifts;
}

/**
 * The gap the pointer is in. Distance picks the row, the flow axis picks the
 * side: walking the axis alone would send every drop in a grid's left column to
 * the first gap, since those cards all share an x range.
 *
 * @param {Box[]} boxes
 * @param {number} x
 * @param {number} y
 * @param {boolean} horizontal
 */
export function insertionSlot(boxes, x, y, horizontal) {
  let nearest = -1;
  let shortest = Infinity;
  boxes.forEach((box, index) => {
    const distance = squaredDistanceTo(box, x, y);
    if (distance < shortest) {
      shortest = distance;
      nearest = index;
    }
  });
  if (nearest < 0) return 0;
  const box = boxes[nearest];
  const middle = horizontal ? box.left + box.width / 2 : box.top + box.height / 2;
  return (horizontal ? x : y) < middle ? nearest : nearest + 1;
}

/**
 * Squared distance from a point to a box, zero anywhere inside it.
 *
 * @param {Box} box
 * @param {number} x
 * @param {number} y
 */
function squaredDistanceTo(box, x, y) {
  const dx = Math.max(box.left - x, 0, x - (box.left + box.width));
  const dy = Math.max(box.top - y, 0, y - (box.top + box.height));
  return dx * dx + dy * dy;
}

/**
 * The element a list actually scrolls in: the page-side list scrolls the
 * window, the drawer's scrolls a panel several levels up.
 *
 * @param {HTMLElement | undefined} node
 * @returns {HTMLElement | null}
 */
function scrollParent(node) {
  let el = node?.parentElement ?? null;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Both the window and the container count: either can move under a drag.
 *
 * @param {HTMLElement | null} container
 */
function scrollOrigin(container) {
  return {
    x: window.scrollX + (container?.scrollLeft ?? 0),
    y: window.scrollY + (container?.scrollTop ?? 0),
  };
}

/**
 * @param {ScrollState} state
 * @param {number} clientY
 */
function driveAutoScroll(state, clientY) {
  // Edges of the scroller, not of the screen: in the drawer the list runs out
  // well above the bottom of the window.
  const bounds = state.container
    ? state.container.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight };
  state.vy = clientY < bounds.top + EDGE_ZONE
    ? -ramp(bounds.top + EDGE_ZONE - clientY)
    : clientY > bounds.bottom - EDGE_ZONE
      ? ramp(clientY - (bounds.bottom - EDGE_ZONE))
      : 0;
  if (state.vy && !state.raf) {
    state.raf = requestAnimationFrame(() => stepAutoScroll(state));
  }
}

/** @param {number} depth */
function ramp(depth) {
  return Math.round(EDGE_SPEED * Math.min(1, depth / EDGE_ZONE));
}

/** @param {ScrollState} state */
function stepAutoScroll(state) {
  if (!state.vy) {
    state.raf = 0;
    return;
  }
  if (state.container) state.container.scrollTop += state.vy;
  else window.scrollBy(0, state.vy);
  state.raf = requestAnimationFrame(() => stepAutoScroll(state));
}

/** @param {ScrollState} state */
function stopAutoScroll(state) {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.vy = 0;
  state.container = null;
}

/** Saved so the lock restores whatever the host page had set, not a default. */
let pageLock = /** @type {{ userSelect: string, cursor: string } | null} */ (null);

function lockPage() {
  if (pageLock || typeof document === "undefined") return;
  const { style } = document.body;
  pageLock = { userSelect: style.userSelect, cursor: style.cursor };
  style.userSelect = "none";
  // Pointer capture does not move the cursor, so the grabbing hand has to come
  // from the body or it flickers back to whatever is under the pointer.
  style.cursor = "grabbing";
}

function unlockPage() {
  if (!pageLock || typeof document === "undefined") return;
  document.body.style.userSelect = pageLock.userSelect;
  document.body.style.cursor = pageLock.cursor;
  pageLock = null;
}
