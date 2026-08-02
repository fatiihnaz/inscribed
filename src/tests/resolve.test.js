/**
 * The value-precedence and dirty rules, which a dozen call sites used to spell
 * out for themselves. The cases that matter are the ones the spelled-out copies
 * disagreed on: an explicit empty draft, a draft typed back to the published
 * value, and a missing block.
 */
import { describe, it, expect } from "vitest";

import { resolveBlockValue, isBlockDirty, resolveItemData } from "../lib/resolve.js";

/** @param {*} extra */
const block = (extra = {}) => ({
  blockPath: "hero.title",
  blockType: "ShortText",
  value: "yayında",
  draftValue: null,
  version: 1,
  sortOrder: 1,
  ...extra,
});

describe("resolveBlockValue", () => {
  it("prefers the local draft over both server layers", () => {
    expect(resolveBlockValue(block({ draftValue: "sunucu" }), true, "yerel")).toBe("yerel");
  });

  it("treats an explicit empty draft as an edit, not as absence", () => {
    // The whole reason presence is a separate argument: `"" ?? published` and
    // `null ?? published` would both fall through to the published value.
    expect(resolveBlockValue(block(), true, "")).toBe("");
    expect(resolveBlockValue(block(), true, null)).toBe(null);
  });

  it("falls back to the server draft, then the published value", () => {
    expect(resolveBlockValue(block({ draftValue: "sunucu" }))).toBe("sunucu");
    expect(resolveBlockValue(block())).toBe("yayında");
  });

  it("is undefined for a missing block, unless a draft says otherwise", () => {
    expect(resolveBlockValue(undefined)).toBeUndefined();
    expect(resolveBlockValue(null, true, "yerel")).toBe("yerel");
  });
});

describe("isBlockDirty", () => {
  it("ignores a local draft that matches what is published", () => {
    // Typing a change and undoing it by hand leaves a draft that is no longer
    // a change.
    expect(isBlockDirty(block(), true, "yayında")).toBe(false);
    expect(isBlockDirty(block(), true, "başka")).toBe(true);
  });

  it("counts an untouched server draft", () => {
    expect(isBlockDirty(block({ draftValue: "sunucu" }), false, undefined)).toBe(true);
    expect(isBlockDirty(block(), false, undefined)).toBe(false);
  });

  it("compares structurally, so a rebuilt equal object is clean", () => {
    const b = block({ value: { src: "a.png", alt: "" } });
    expect(isBlockDirty(b, true, { src: "a.png", alt: "" })).toBe(false);
  });

  it("says nothing is dirty without a block", () => {
    expect(isBlockDirty(null, true, "x")).toBe(false);
  });
});

describe("resolveItemData", () => {
  const row = { id: "1", collectionKey: "news", slug: "q1", data: { title: "Yayın" }, version: 1 };

  it("promotes a local draft into both data and draftData", () => {
    const out = resolveItemData(row, { title: "Taslak" });
    expect(out.data).toEqual({ title: "Taslak" });
    expect(out.draftData).toEqual({ title: "Taslak" });
  });

  it("promotes a server draft over published data", () => {
    const withDraft = { ...row, draftData: { title: "Sunucu" } };
    expect(resolveItemData(withDraft, undefined).data).toEqual({ title: "Sunucu" });
  });

  it("returns the same reference when nothing overlays", () => {
    // Identity is the signal a list uses to skip re-rendering a row.
    expect(resolveItemData(row, undefined)).toBe(row);
  });
});
