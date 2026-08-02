/**
 * The page + global merge, shared by the server fetch and the admin refetch.
 * The `_slug` stamp is the load-bearing part: without it the save layer PUTs a
 * header edited from a page back onto that page.
 */
import { describe, it, expect } from "vitest";

import { mergePageBlocks, resolveGlobalSlug } from "../../core/merge-blocks.js";

/** @param {string} path @param {*} extra */
const block = (path, extra = {}) => ({
  blockPath: path,
  blockType: "ShortText",
  value: path,
  version: 1,
  sortOrder: 1,
  ...extra,
});

describe("resolveGlobalSlug", () => {
  it("is null when there is none, or when it is the page itself", () => {
    expect(resolveGlobalSlug(undefined, "/")).toBe(null);
    expect(resolveGlobalSlug("__global", "__global")).toBe(null);
    expect(resolveGlobalSlug("__global", "/")).toBe("__global");
  });
});

describe("mergePageBlocks", () => {
  it("stamps each block with the slug it came from", () => {
    const out = mergePageBlocks({
      slug: "/",
      globalSlug: "__global",
      pageBlocks: [block("hero.title")],
      globalBlocks: [block("footer.note")],
    });
    expect(out.map((b) => [b.blockPath, b._slug])).toEqual([
      ["hero.title", "/"],
      ["footer.note", "__global"],
    ]);
  });

  it("lets the page win a path collision and drops the global twin", () => {
    const out = mergePageBlocks({
      slug: "/",
      globalSlug: "__global",
      pageBlocks: [block("note", { value: "sayfa" })],
      globalBlocks: [block("note", { value: "global" })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("sayfa");
    expect(out[0]._slug).toBe("/");
  });

  it("appends global blocks after the page's", () => {
    const out = mergePageBlocks({
      slug: "/",
      globalSlug: "__global",
      pageBlocks: [block("a"), block("b")],
      globalBlocks: [block("z")],
    });
    expect(out.map((b) => b.blockPath)).toEqual(["a", "b", "z"]);
  });

  it("still stamps the page when there is no global half", () => {
    const out = mergePageBlocks({
      slug: "/x", globalSlug: null, pageBlocks: [block("a")], globalBlocks: [],
    });
    expect(out).toEqual([expect.objectContaining({ blockPath: "a", _slug: "/x" })]);
  });

  it("does not mutate the inputs", () => {
    const pageBlocks = [block("a")];
    mergePageBlocks({ slug: "/", globalSlug: null, pageBlocks, globalBlocks: [] });
    expect(pageBlocks[0]._slug).toBeUndefined();
  });
});
