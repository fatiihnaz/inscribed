// @vitest-environment jsdom
/**
 * The per-item controls on an admin `<EditableList>`.
 *
 * Three of these guard decisions that are invisible in the markup and easy to
 * undo by accident:
 *
 *   - the row is mounted even while hidden, because an unmounted button cannot
 *     be tabbed to and a vanished grip drops its drag mid-gesture
 *   - after a move, focus follows the item: index keys leave the DOM node in
 *     place and swap its content, so the button under the cursor now drives a
 *     different item
 *   - arrow direction is measured, not assumed; a list flowing left to right
 *     moves left and right
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { EditableList } from "../../core/EditableList.jsx";
import {
  flipInverses, insertionSlot, isHorizontalFlow, landingIndex, landingOffset,
  neighbourDirection, slotShifts,
} from "../../core/hooks/use-list-reorder.js";

const PATH = "team.members";
const ITEM_SCHEMA = { name: { blockType: "ShortText", defaultValue: "" } };

const listBlock = () => ({
  blockPath: PATH,
  blockType: "List",
  value: [{ name: "Ada" }, { name: "Bora" }, { name: "Cem" }],
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

const transport = {
  getContent: async () => ({ slug: "/", blocks: [listBlock()] }),
  getMyCollections: async () => [],
  updateDraft: async () => undefined,
  updateContent: async () => ({ updated: 1, unchanged: 0 }),
  deleteDraft: async () => undefined,
};

/** The render-prop runs once per item per list render, so it counts them. */
let listRenders = 0;

async function mount(props = {}) {
  listRenders = 0;
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[listBlock()]}
      >
        <EditableList blockPath={PATH} itemSchema={ITEM_SCHEMA} {...props}>
          {(item, i) => {
            listRenders += 1;
            return <p data-testid={`item-${i}`}>{item.name}</p>;
          }}
        </EditableList>
      </CmsProvider>,
    );
  });
}

const listWarnings = (spy) =>
  spy.mock.calls.map(([m]) => String(m)).filter((m) => m.includes("<EditableList"));

/** The wrapper each item's chrome hangs on: grip -> actions row -> wrapper. */
const itemWrappers = () =>
  screen.getAllByLabelText("Drag to reorder").map((grip) => grip.parentElement?.parentElement);

/** A painted box per element: what the drag measures the pointer against. */
function stubBoxes(elements, boxes) {
  elements.forEach((el, i) => {
    vi.spyOn(/** @type {*} */ (el), "getBoundingClientRect").mockReturnValue(
      /** @type {*} */ ({ width: 100, height: 40, right: 0, bottom: 0, ...boxes[i] }),
    );
  });
}

/**
 * A *layout* box per element: what the arrows read their direction from. Kept
 * separate from the painted one on purpose, since the whole point of reading
 * `offset*` is that the two can disagree while something is animating.
 */
function stubLayout(elements, boxes) {
  elements.forEach((el, i) => {
    const box = { offsetLeft: 0, offsetTop: 0, offsetWidth: 100, offsetHeight: 40, ...boxes[i] };
    for (const [key, value] of Object.entries(box)) {
      Object.defineProperty(el, key, { value, configurable: true });
    }
  });
}

beforeEach(() => {
  // The draft write these clicks queue is not what is under test; freezing the
  // clock keeps its timer from firing into a torn-down tree.
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("list item controls", () => {
  it("mounts every control up front, so the keyboard can reach them", async () => {
    await mount();
    // Nothing has been hovered: under the old build these did not exist yet.
    expect(screen.getAllByLabelText("Move up")).toHaveLength(3);
    expect(screen.getAllByLabelText("Move down")).toHaveLength(3);
    expect(screen.getAllByLabelText("Delete")).toHaveLength(3);
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(3);
  });

  it("drops the in-page add slot on request, keeping everything else", async () => {
    await mount({ noInlineAdd: true });

    expect(screen.queryByLabelText("Add a new item")).toBe(null);
    // Nor is the render-prop called with a blank item, which is what the slot
    // renders as its hidden footprint: a layout that opts out often cannot
    // draw one.
    expect(screen.queryByTestId("item-3")).toBe(null);
    // Still a fully editable list otherwise.
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(3);
    expect(screen.getAllByLabelText("Delete")).toHaveLength(3);
  });

  it("drops the slot for the older spelling too", async () => {
    await mount({ inlineAdd: false });
    expect(screen.queryByLabelText("Add a new item")).toBe(null);
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(3);
  });

  it("says so when layout props arrive with no `as` to put them on", async () => {
    // Otherwise the props are dropped in silence and the symptom reads as a
    // CSS problem rather than a missing prop.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount({ className: "feature-grid", style: { display: "grid" } });

    // Matched on our own message: the provider warns about the inline `config`
    // literal these tests mount with, which is not what is under test.
    const ours = listWarnings(warn);
    expect(ours).toHaveLength(1);
    expect(ours[0]).toContain("className");
    expect(ours[0]).toContain("style");
  });

  it("stays quiet once `as` is there to take them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount({ as: "div", className: "feature-grid" });

    expect(listWarnings(warn)).toHaveLength(0);
  });

  it("rings a card with the card's own radius, not the house one", async () => {
    await mount();
    const [wrapper] = itemWrappers();
    const card = /** @type {HTMLElement} */ (wrapper?.firstElementChild);
    // The consumer's card, whatever shape they gave it. It carries a fill as
    // well as a radius because that is what makes the radius visible; the ring
    // only matches content that paints a box.
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => /** @type {*} */ (
      el === card
        ? { borderTopLeftRadius: "20px", borderTopRightRadius: "20px",
            borderBottomRightRadius: "20px", borderBottomLeftRadius: "20px",
            backgroundColor: "rgb(255, 255, 255)" }
        : { overflowY: "visible" }
    ));

    await act(async () => {
      fireEvent.mouseEnter(/** @type {*} */ (wrapper));
    });

    expect(/** @type {HTMLElement} */ (wrapper).style.borderRadius).toBe("20px");
  });

  it("shows the add slot by default", async () => {
    await mount();
    expect(screen.getByLabelText("Add a new item")).toBeTruthy();
    expect(screen.getByTestId("item-3")).toBeTruthy();
  });

  it("keeps the end arrows mounted but disabled, so the row never resizes", async () => {
    await mount();
    const ups = /** @type {HTMLButtonElement[]} */ (screen.getAllByLabelText("Move up"));
    const downs = /** @type {HTMLButtonElement[]} */ (screen.getAllByLabelText("Move down"));

    expect(ups[0].disabled).toBe(true);
    expect(ups[1].disabled).toBe(false);
    expect(downs[2].disabled).toBe(true);
    expect(downs[1].disabled).toBe(false);
  });

  it("sends focus after the item it moved, not the slot it left", async () => {
    await mount();
    const downs = screen.getAllByLabelText("Move down");

    await act(async () => {
      fireEvent.click(downs[0]);
    });

    expect(screen.getByTestId("item-0").textContent).toBe("Bora");
    expect(screen.getByTestId("item-1").textContent).toBe("Ada");
    // Focus is on the second row's button: press again and Ada keeps moving.
    expect(document.activeElement).toBe(screen.getAllByLabelText("Move down")[1]);
  });

  it("falls back to the opposite arrow when the move lands on an end", async () => {
    await mount();
    const downs = screen.getAllByLabelText("Move down");

    // Index 1 -> 2 is the last slot, where "move down" is disabled and cannot
    // hold focus.
    await act(async () => {
      fireEvent.click(downs[1]);
    });

    expect(document.activeElement).toBe(screen.getAllByLabelText("Move up")[2]);
  });

  it("carries an item to a typed position in one move", async () => {
    await mount();
    // The counter is the affordance: double-click, type a seat, press Enter.
    await act(async () => {
      fireEvent.doubleClick(screen.getByTitle("Item 3 of 3"));
    });
    const input = screen.getByLabelText("Type a position to move it there");

    await act(async () => {
      fireEvent.change(input, { target: { value: "1" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(screen.getByTestId("item-0").textContent).toBe("Cem");
    expect(screen.getByTestId("item-1").textContent).toBe("Ada");
    expect(screen.getByTestId("item-2").textContent).toBe("Bora");
  });

  it("clamps a typed position, and treats nonsense as a cancel", async () => {
    await mount();

    await act(async () => {
      fireEvent.doubleClick(screen.getByTitle("Item 1 of 3"));
    });
    await act(async () => {
      const input = screen.getByLabelText("Type a position to move it there");
      fireEvent.change(input, { target: { value: "99" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByTestId("item-2").textContent).toBe("Ada");

    // Emptied and confirmed: nothing moves, rather than landing at seat zero.
    await act(async () => {
      fireEvent.doubleClick(screen.getByTitle("Item 1 of 3"));
    });
    await act(async () => {
      const input = screen.getByLabelText("Type a position to move it there");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByTestId("item-0").textContent).toBe("Bora");
  });

  it("leaves the order alone when the edit is escaped", async () => {
    await mount();

    await act(async () => {
      fireEvent.doubleClick(screen.getByTitle("Item 3 of 3"));
    });
    await act(async () => {
      const input = screen.getByLabelText("Type a position to move it there");
      fireEvent.change(input, { target: { value: "1" } });
      fireEvent.keyDown(input, { key: "Escape" });
    });

    expect(screen.getByTestId("item-0").textContent).toBe("Ada");
    expect(screen.queryByLabelText("Type a position to move it there")).toBe(null);
  });

  it("switches to left/right once the items measure side by side", async () => {
    await mount();
    const wrappers = itemWrappers();
    stubLayout(wrappers, [{ offsetLeft: 0 }, { offsetLeft: 120 }, { offsetLeft: 240 }]);

    await act(async () => {
      fireEvent.mouseEnter(/** @type {*} */ (wrappers[0]));
    });

    expect(screen.getAllByLabelText("Move right")).toHaveLength(1);
    // Only the hovered item re-measured: flow direction is local state, so a
    // hover does not re-render every sibling.
    expect(screen.getAllByLabelText("Move down")).toHaveLength(2);
  });

  it("reads direction from layout, not from what a move animation painted", async () => {
    // The regression: pressing an arrow moves focus, which re-measures, and it
    // used to land on the frame where the animation had every neighbour offset.
    // Both arrows then agreed on one direction and stayed stuck there.
    await mount();
    const wrappers = itemWrappers();
    // Laid out as a two-column grid: item 2 sits right of item 1, item 3 below.
    stubLayout(wrappers, [
      { offsetLeft: 0, offsetTop: 0 },
      { offsetLeft: 120, offsetTop: 0 },
      { offsetLeft: 0, offsetTop: 60 },
    ]);
    // Painted somewhere else entirely, as a mid-animation transform would.
    stubBoxes(wrappers, [{ left: 0, top: 900 }, { left: 0, top: 940 }, { left: 0, top: 980 }]);

    await act(async () => {
      fireEvent.mouseEnter(/** @type {*} */ (wrappers[1]));
    });

    // Back is the card to its left; forward is the one starting the next row.
    expect(screen.getAllByLabelText("Move left")).toHaveLength(1);
    expect(screen.getAllByLabelText("Move down")).toHaveLength(3);
  });
});

describe("dragging", () => {
  /** jsdom has no pointer capture; the drag only needs it not to throw. */
  function stubPointerCapture() {
    HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
    HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
    HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() { return false; };
  }

  /** @param {number} y */
  function scrollWindowTo(y) {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true });
  }

  async function dragFrom(gripIndex, toClientY) {
    const grip = screen.getAllByLabelText("Drag to reorder")[gripIndex];
    await act(async () => {
      fireEvent.pointerDown(grip, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
    });
    await act(async () => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: toClientY });
    });
    await act(async () => {
      fireEvent.pointerUp(grip, { pointerId: 1 });
    });
    // The array is committed only once the card has settled into its slot, so
    // every assertion below waits rather than reading straight away.
  }

  beforeEach(() => {
    // Real timers here: the settle is a genuine timeout, and driving it with
    // fake ones also drives the draft autosave queue into a loop.
    vi.useRealTimers();
    stubPointerCapture();
  });
  afterEach(() => scrollWindowTo(0));

  it("drops where the pointer is, on a page that has been scrolled", async () => {
    // The regression this guards: the snapshot and the pointer each picked up
    // the scroll offset, but the boxes picked it up twice. Every box then sat a
    // screen-height below the pointer, so every drop read as the first gap.
    await mount();
    scrollWindowTo(500);
    stubBoxes(itemWrappers(), [{ top: 0 }, { top: 50 }, { top: 100 }].map((b) => ({ ...b, left: 0 })));

    // Past the last card's middle (100 + 40/2 = 120): the gap after everything.
    await dragFrom(0, 130);

    await waitFor(() => {
      expect(screen.getByTestId("item-2").textContent).toBe("Ada");
    });
    expect(screen.getByTestId("item-0").textContent).toBe("Bora");
  });

  it("drops into a middle gap rather than snapping to an end", async () => {
    await mount();
    scrollWindowTo(320);
    stubBoxes(itemWrappers(), [{ top: 0 }, { top: 50 }, { top: 100 }].map((b) => ({ ...b, left: 0 })));

    // Between the first and second cards.
    await dragFrom(2, 45);

    await waitFor(() => {
      expect(screen.getByTestId("item-1").textContent).toBe("Cem");
    });
    expect(screen.getByTestId("item-0").textContent).toBe("Ada");
    expect(screen.getByTestId("item-2").textContent).toBe("Bora");
  });

  it("crosses slots without re-rendering the list", async () => {
    // The card positions travel to the DOM as CSS variables precisely so that
    // moving the pointer costs no renders. Putting them back in React state
    // would be invisible here except through this count.
    await mount();
    stubBoxes(itemWrappers(), [{ top: 0 }, { top: 50 }, { top: 100 }].map((b) => ({ ...b, left: 0 })));
    const grip = screen.getAllByLabelText("Drag to reorder")[0];

    await act(async () => {
      fireEvent.pointerDown(grip, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
    });
    const afterPickup = listRenders;

    await act(async () => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 60 });
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 80 });
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 130 });
    });

    expect(listRenders).toBe(afterPickup);

    await act(async () => {
      fireEvent.pointerUp(grip, { pointerId: 1 });
    });
    await waitFor(() => expect(screen.getByTestId("item-2").textContent).toBe("Ada"));
  });

  it("leaves the order alone when the drag is cancelled", async () => {
    await mount();
    stubBoxes(itemWrappers(), [{ top: 0 }, { top: 50 }, { top: 100 }].map((b) => ({ ...b, left: 0 })));

    const grip = screen.getAllByLabelText("Drag to reorder")[0];
    await act(async () => {
      fireEvent.pointerDown(grip, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 130 });
      fireEvent.pointerCancel(grip, { pointerId: 1 });
    });
    await act(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 300); });
    });

    expect(screen.getByTestId("item-0").textContent).toBe("Ada");
  });
});

describe("drop geometry", () => {
  const box = (left, top) => ({ left, top, width: 100, height: 40 });
  const stacked = [box(0, 0), box(0, 50), box(0, 100)];
  const inARow = [box(0, 0), box(120, 0), box(240, 0)];
  // Two columns, three rows.
  const grid = [box(0, 0), box(120, 0), box(0, 60), box(120, 60), box(0, 120), box(120, 120)];

  it("reads the flow axis off two adjacent boxes", () => {
    expect(isHorizontalFlow(box(0, 0), box(120, 0))).toBe(true);
    expect(isHorizontalFlow(box(0, 0), box(0, 50))).toBe(false);
    // A wrapped grid still reads as horizontal while the row is unbroken.
    expect(isHorizontalFlow(box(0, 0), box(120, 2))).toBe(true);
  });

  it("returns the gap the pointer sits in, counting past the last item", () => {
    // Above the first middle (y=20) is the gap before everything.
    expect(insertionSlot(stacked, 0, 5, false)).toBe(0);
    // Past the first middle but not the second (y=70): the gap between them.
    expect(insertionSlot(stacked, 0, 40, false)).toBe(1);
    expect(insertionSlot(stacked, 0, 95, false)).toBe(2);
    // Past every middle: the slot after the last item.
    expect(insertionSlot(stacked, 0, 500, false)).toBe(3);
  });

  it("measures along x when the list flows sideways", () => {
    expect(insertionSlot(inARow, 10, 0, true)).toBe(0);
    expect(insertionSlot(inARow, 130, 0, true)).toBe(1);
    expect(insertionSlot(inARow, 999, 0, true)).toBe(3);
    // Far below the row it still resolves to the nearest column.
    expect(insertionSlot(inARow, 10, 900, true)).toBe(0);
  });

  it("picks the row before the side, so a grid's left column is not one gap", () => {
    // Every left-column card shares an x range, so an x-only walk would send
    // all three of these to slot 0.
    expect(insertionSlot(grid, 10, 10, true)).toBe(0);
    expect(insertionSlot(grid, 10, 70, true)).toBe(2);
    expect(insertionSlot(grid, 10, 130, true)).toBe(4);
    // Past the left card's middle in the bottom row: the gap before the right one.
    expect(insertionSlot(grid, 90, 130, true)).toBe(5);
    expect(insertionSlot(grid, 900, 130, true)).toBe(6);
  });

  it("names the direction a move actually travels", () => {
    // Same row: a plain sideways step.
    expect(neighbourDirection(grid[0], grid[1])).toBe("right");
    expect(neighbourDirection(grid[1], grid[0])).toBe("left");
    // The right-hand card's forward neighbour starts the next row, so the move
    // is down even though the box is far to the left.
    expect(neighbourDirection(grid[1], grid[2])).toBe("down");
    expect(neighbourDirection(grid[2], grid[1])).toBe("up");
    // A plain column only ever moves up and down.
    expect(neighbourDirection(stacked[0], stacked[1])).toBe("down");
    expect(neighbourDirection(stacked[2], stacked[1])).toBe("up");
  });

  it("reads no direction from boxes that have not been laid out", () => {
    // Both arrows would otherwise collapse onto the same one.
    expect(neighbourDirection(box(0, 0), box(0, 0))).toBe(null);
    expect(neighbourDirection({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBe(null);
  });

  it("shifts the cards between the two positions by one slot", () => {
    // Dragging the first card into the gap before the last: the two it passes
    // each take over the slot in front of them.
    const forward = slotShifts(stacked, 0, 3);
    expect([...forward.keys()]).toEqual([1, 2]);
    expect(forward.get(1)).toEqual({ dx: 0, dy: -50 });
    expect(forward.get(2)).toEqual({ dx: 0, dy: -50 });

    // Dragging the last card to the front pushes the others the other way.
    const backward = slotShifts(stacked, 2, 0);
    expect([...backward.keys()]).toEqual([0, 1]);
    expect(backward.get(0)).toEqual({ dx: 0, dy: 50 });

    // In a grid the shift is diagonal: end of one row to the start of the next.
    expect(slotShifts(grid, 0, 3).get(2)).toEqual({ dx: 120, dy: -60 });

    // A drop that changes nothing moves nothing.
    expect(slotShifts(stacked, 1, 1).size).toBe(0);
    expect(slotShifts(stacked, 1, 2).size).toBe(0);
  });

  it("replays a finished move backwards, so a button press animates too", () => {
    // Swapping the first two: after the commit each box holds the other's
    // content, so each is offset to where that content used to be and released.
    const swap = flipInverses(stacked, 0, 1);
    expect(swap.get(0)).toEqual({ dx: 0, dy: 50 });  // now holds what was below
    expect(swap.get(1)).toEqual({ dx: 0, dy: -50 }); // now holds what was above

    // A jump from the end to the front drags everything it passed along.
    const jump = flipInverses(stacked, 2, 0);
    expect(jump.get(0)).toEqual({ dx: 0, dy: 100 });
    expect(jump.get(1)).toEqual({ dx: 0, dy: -50 });
    expect(jump.get(2)).toEqual({ dx: 0, dy: -50 });

    // In a grid the replay is diagonal, same as the drag's.
    expect(flipInverses(grid, 1, 2).get(2)).toEqual({ dx: 120, dy: -60 });

    expect(flipInverses(stacked, 1, 1).size).toBe(0);
  });

  it("maps a drop slot onto the index the card ends up at", () => {
    expect(landingIndex(0, 3)).toBe(2);
    expect(landingIndex(2, 0)).toBe(0);
    expect(landingIndex(1, 1)).toBe(1);
  });

  it("offsets the landing slot from the card's own, in both axes", () => {
    // Straight down two rows in a column.
    expect(landingOffset(stacked, 0, 3)).toEqual({ dx: 0, dy: 100 });
    // Diagonally in a grid: right column of the first row to left of the last.
    expect(landingOffset(grid, 1, 5)).toEqual({ dx: -120, dy: 120 });
    // Dropping where it already is asks for no movement at all.
    expect(landingOffset(stacked, 1, 1)).toEqual({ dx: 0, dy: 0 });
    expect(landingOffset(stacked, 1, 2)).toEqual({ dx: 0, dy: 0 });
  });
});
