import { describe, it, expect } from "vitest";
import {
  getBlock,
  getBlockValue,
  groupBlocksByPrefix,
  indexBlocksByPath,
} from "../../core/blocks.js";

/** @type {import("../../shared/contracts/schemas.js").BlockResponse[]} */
const blocks = [
  { blockPath: "hero.title", blockType: "LongText", value: "Welcome", sortOrder: 0, version: 1 },
  { blockPath: "hero.subtitle", blockType: "LongText", value: "Sub", sortOrder: 1, version: 1 },
  { blockPath: "hero", blockType: "LongText", value: "exact", sortOrder: 2, version: 1 },
  { blockPath: "footer.note", blockType: "LongText", value: "Note", sortOrder: 3, version: 1 },
];

describe("getBlock", () => {
  it("finds a block by path in an array", () => {
    expect(getBlock(blocks, "hero.subtitle")?.value).toBe("Sub");
  });

  it("finds a block by path in a Map", () => {
    const map = indexBlocksByPath(blocks);
    expect(getBlock(map, "footer.note")?.value).toBe("Note");
  });

  it("returns undefined for a missing path", () => {
    expect(getBlock(blocks, "nope")).toBeUndefined();
  });
});

describe("getBlockValue", () => {
  it("returns the value of a found block", () => {
    expect(getBlockValue(blocks, "hero.title")).toBe("Welcome");
  });

  it("returns undefined when the block is missing", () => {
    expect(getBlockValue(blocks, "missing")).toBeUndefined();
  });
});

describe("groupBlocksByPrefix", () => {
  it("returns blocks matching the prefix exactly or as a dotted child", () => {
    const out = groupBlocksByPrefix(blocks, "hero").map((b) => b.blockPath);
    expect(out).toEqual(["hero.title", "hero.subtitle", "hero"]);
  });

  it("does not match a prefix that is only a string prefix of another segment", () => {
    // "footer" must not match "footer.note" via bare startsWith without the dot
    // boundary check - here we assert a non-dotted near-miss is excluded.
    const near = [{ blockPath: "heroic.x", blockType: "LongText", value: 1, sortOrder: 0, version: 1 }];
    expect(groupBlocksByPrefix(near, "hero")).toEqual([]);
  });

  it("preserves input order and works over a Map", () => {
    const map = indexBlocksByPath(blocks);
    expect(groupBlocksByPrefix(map, "footer").map((b) => b.blockPath)).toEqual(["footer.note"]);
  });
});

describe("indexBlocksByPath legacy types", () => {
  it("folds the pre-4.0 `Text` alias into LongText", () => {
    const map = indexBlocksByPath([
      { blockPath: "a", blockType: "Text", value: "x", sortOrder: 0, version: 1 },
    ]);
    expect(map.get("a").blockType).toBe("LongText");
  });

  it("hands back the same object when nothing needs rewriting", () => {
    const block = { blockPath: "a", blockType: "LongText", value: "x", sortOrder: 0, version: 1 };
    expect(indexBlocksByPath([block]).get("a")).toBe(block);
  });
});

describe("indexBlocksByPath", () => {
  it("keys a Map by blockPath", () => {
    const map = indexBlocksByPath(blocks);
    expect(map.size).toBe(4);
    expect(map.get("hero.title")?.value).toBe("Welcome");
  });
});
