import { describe, it, expect } from "vitest";
import {
  makeDefaultItem, moveItem, moveItemTo, moveItemToIndex, removeItem, addItem,
  dropIndex, moveIndex,
} from "../../shared/util/list-ops.js";

describe("makeDefaultItem", () => {
  it("builds an object from each field's defaultValue", () => {
    const schema = {
      title: { blockType: "LongText", defaultValue: "" },
      count: { blockType: "LongText", defaultValue: 0 },
    };
    expect(makeDefaultItem(schema)).toEqual({ title: "", count: 0 });
  });

  it("deep-clones non-null defaults so new items don't share references", () => {
    const schema = { img: { blockType: "Image", defaultValue: { src: "", alt: "" } } };
    const a = makeDefaultItem(schema);
    const b = makeDefaultItem(schema);
    expect(a.img).toEqual(b.img);
    expect(a.img).not.toBe(b.img); // distinct references
    a.img.src = "mutated";
    expect(b.img.src).toBe(""); // mutation does not leak
  });

  it("passes null/undefined defaults through without cloning", () => {
    const schema = { a: { blockType: "LongText", defaultValue: null } };
    expect(makeDefaultItem(schema)).toEqual({ a: null });
  });

  it("returns an empty object for nullish schema", () => {
    expect(makeDefaultItem(null)).toEqual({});
    expect(makeDefaultItem(undefined)).toEqual({});
  });
});

describe("moveItem", () => {
  it("swaps an item with its neighbour and returns a new array", () => {
    const items = ["a", "b", "c"];
    const moved = moveItem(items, 0, 1);
    expect(moved).toEqual(["b", "a", "c"]);
    expect(moved).not.toBe(items); // new reference
    expect(items).toEqual(["a", "b", "c"]); // original untouched
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("returns the SAME reference on an out-of-bounds move (no-op signal)", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 0, -1)).toBe(items); // can't go up from top
    expect(moveItem(items, 1, 1)).toBe(items); // can't go down from bottom
  });
});

describe("moveItemTo", () => {
  it("drops an item into a later gap, counting the slot it vacates", () => {
    // Slot 3 is the gap between "c" and "d", so "a" lands third, not fourth.
    expect(moveItemTo(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "a", "d"]);
  });

  it("drops an item into an earlier gap", () => {
    expect(moveItemTo(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("drops past the last item", () => {
    expect(moveItemTo(["a", "b", "c"], 0, 3)).toEqual(["b", "c", "a"]);
  });

  it("keeps object identity, so React's index keys stay honest", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const moved = moveItemTo([a, b], 0, 2);
    expect(moved[0]).toBe(b);
    expect(moved[1]).toBe(a);
  });

  it("returns the SAME reference when the drop changes nothing", () => {
    const items = ["a", "b", "c"];
    expect(moveItemTo(items, 1, 1)).toBe(items); // into its own gap
    expect(moveItemTo(items, 1, 2)).toBe(items); // into the gap just after it
    expect(moveItemTo(items, 5, 0)).toBe(items); // no such item
  });

  it("clamps a slot beyond either end", () => {
    const items = ["a", "b", "c"];
    // Both clamp onto the item's own gap, so both are no-ops.
    expect(moveItemTo(items, 2, 99)).toBe(items);
    expect(moveItemTo(items, 0, -5)).toBe(items);
    // From the far end they are real moves.
    expect(moveItemTo(items, 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItemTo(items, 2, -5)).toEqual(["c", "a", "b"]);
  });
});

describe("moveItemToIndex", () => {
  it("seats an item at the position a person would name", () => {
    const items = ["a", "b", "c", "d", "e"];
    // "be the fourth" from the front: a lands at index 3.
    expect(moveItemToIndex(items, 0, 3)).toEqual(["b", "c", "d", "a", "e"]);
    // ...and from behind: e lands at index 3 too.
    expect(moveItemToIndex(items, 4, 3)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("carries the far end of a long list in one move", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const moved = moveItemToIndex(items, 99, 3);
    expect(moved[3]).toBe(99);
    expect(moved.indexOf(99)).toBe(3);
    expect(moved).toHaveLength(100);
  });

  it("clamps a seat outside the list", () => {
    const items = ["a", "b", "c"];
    expect(moveItemToIndex(items, 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItemToIndex(items, 2, -4)).toEqual(["c", "a", "b"]);
  });

  it("returns the SAME reference for its own seat, and for an empty list", () => {
    const items = ["a", "b", "c"];
    expect(moveItemToIndex(items, 1, 1)).toBe(items);
    const empty = [];
    expect(moveItemToIndex(empty, 0, 0)).toBe(empty);
  });
});

describe("removeItem", () => {
  it("removes the item at index and returns a new array", () => {
    const items = ["a", "b", "c"];
    const next = removeItem(items, 1);
    expect(next).toEqual(["a", "c"]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("is a no-op value-wise for an out-of-range index", () => {
    expect(removeItem(["a", "b"], 5)).toEqual(["a", "b"]);
  });
});

describe("addItem", () => {
  it("appends a fresh schema-defaulted item", () => {
    const schema = { title: { blockType: "LongText", defaultValue: "" } };
    const next = addItem([{ title: "x" }], schema);
    expect(next).toEqual([{ title: "x" }, { title: "" }]);
  });

  it("does not mutate the input array", () => {
    const items = [];
    addItem(items, { title: { blockType: "LongText", defaultValue: "" } });
    expect(items).toEqual([]);
  });
});
/**
 * The index-set counterparts. A repeatable editor tracks which rows are open by
 * index, so every move above has to be mirrored here or the expanded card ends
 * up on the wrong row. `moveIndex` in particular has to survive a drag across
 * several rows, which a plain swap gets wrong.
 */
describe("dropIndex", () => {
  it("forgets the removed row and slides the ones after it down", () => {
    expect([...dropIndex(new Set([0, 2, 4]), 2)]).toEqual([0, 3]);
  });

  it("leaves earlier rows alone", () => {
    expect([...dropIndex(new Set([0, 1]), 3)]).toEqual([0, 1]);
  });

  it("survives an empty set", () => {
    expect([...dropIndex(new Set(), 1)]).toEqual([]);
  });
});

describe("moveIndex", () => {
  it("carries the moved row to its new index", () => {
    expect(moveIndex(new Set([0]), 0, 3).has(3)).toBe(true);
  });

  it("behaves like a swap for a neighbouring move", () => {
    expect([...moveIndex(new Set([0, 1]), 0, 1)].sort()).toEqual([0, 1]);
    expect([...moveIndex(new Set([1]), 1, 0)]).toEqual([0]);
  });

  it("shifts everything the moved row passes on the way down", () => {
    // 0 -> 3 pulls 1, 2 and 3 back one seat each.
    expect([...moveIndex(new Set([1, 2, 3]), 0, 3)].sort()).toEqual([0, 1, 2]);
  });

  it("shifts everything the moved row passes on the way up", () => {
    // 3 -> 0 pushes 0, 1 and 2 forward one seat each.
    expect([...moveIndex(new Set([0, 1, 2]), 3, 0)].sort()).toEqual([1, 2, 3]);
  });

  it("leaves rows outside the travelled range alone", () => {
    expect([...moveIndex(new Set([5]), 0, 2)]).toEqual([5]);
  });

  it("is a no-op when nothing moves", () => {
    const set = new Set([1]);
    expect(moveIndex(set, 2, 2)).toBe(set);
  });
});
