/**
 * The two dirty-set shapes. The collection one unions the live overlay with
 * cached server drafts, which is the part the drawer's separate copies kept
 * getting wrong: the overlay clears as soon as autosave lands, so reading it
 * alone drops the mark off a record whose draft is sitting on the server.
 */
import { describe, it, expect } from "vitest";

import {
  collectDirtyBlocks,
  collectDirtyRecords,
  dirtyCollectionKeys,
  dirtySlugsFor,
} from "../../admin/dirty.js";

/** @param {string} path @param {*} extra */
const block = (path, extra = {}) => ({
  blockPath: path,
  blockType: "ShortText",
  value: "yayında",
  draftValue: null,
  version: 1,
  sortOrder: 1,
  ...extra,
});

const blocks = new Map([
  ["a", block("a")],
  ["b", block("b", { draftValue: "sunucu" })],
  ["c", block("c")],
]);

describe("collectDirtyBlocks", () => {
  it("flags a changed local draft and an untouched server draft alike", () => {
    const dirty = collectDirtyBlocks(blocks, new Map([["a", "değişti"]]));
    expect(dirty.get("a")).toBe(true);
    expect(dirty.get("b")).toBe(true);
    expect(dirty.get("c")).toBe(false);
  });

  it("does not flag a draft typed back to the published value", () => {
    const dirty = collectDirtyBlocks(blocks, new Map([["a", "yayında"]]));
    expect(dirty.get("a")).toBe(false);
  });

  it("covers every block, so a lookup never reads undefined", () => {
    const dirty = collectDirtyBlocks(blocks, new Map());
    expect([...dirty.keys()].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("collectDirtyRecords", () => {
  const cached = (slug, draftData = null) => [
    `news:${slug}`,
    { item: { id: slug, collectionKey: "news", slug, data: {}, draftData, version: 1 }, isLoading: false, error: null },
  ];

  it("unions live overlays with cached server drafts", () => {
    const records = collectDirtyRecords(
      new Map([["news:q1", { title: "x" }]]),
      new Map([cached("q2", { title: "y" }), cached("q3")]),
    );
    expect([...records].sort()).toEqual(["news:q1", "news:q2"]);
  });

  it("counts a record once when both sources carry it", () => {
    const records = collectDirtyRecords(
      new Map([["news:q1", { title: "x" }]]),
      new Map([cached("q1", { title: "x" })]),
    );
    expect([...records]).toEqual(["news:q1"]);
  });

  it("ignores a cache entry with no item yet", () => {
    const records = collectDirtyRecords(
      new Map(),
      new Map([["news:q9", { item: null, isLoading: true, error: null }]]),
    );
    expect(records.size).toBe(0);
  });
});

describe("projections", () => {
  const records = new Set(["news:q1", "news:q2", "teams:ali"]);

  it("groups record keys by collection", () => {
    expect([...dirtyCollectionKeys(records)].sort()).toEqual(["news", "teams"]);
  });

  it("narrows record keys to one collection's slugs", () => {
    expect([...dirtySlugsFor(records, "news")].sort()).toEqual(["q1", "q2"]);
    expect(dirtySlugsFor(records, "yok").size).toBe(0);
  });

  it("does not mistake a collection prefix for a longer one", () => {
    // "news" must not swallow "newsletter".
    expect([...dirtySlugsFor(new Set(["newsletter:a"]), "news")]).toEqual([]);
  });
});
