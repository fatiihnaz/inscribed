/**
 * The rules a shareable admin link is parsed by. Kept away from React because
 * they are the part with edge cases: a marker typed by hand into a URL, or
 * pasted with something else already on it.
 */
import { describe, it, expect } from "vitest";

import { readOpenTarget } from "../../admin/deep-link.js";

describe("readOpenTarget", () => {
  it("answers nothing for a URL that carries no marker", () => {
    expect(readOpenTarget("")).toEqual({ target: null, warning: null });
    expect(readOpenTarget("?page=2")).toEqual({ target: null, warning: null });
  });

  it("reads each of the four things a link can open", () => {
    expect(readOpenTarget("?cms-block=hero.title").target)
      .toEqual({ kind: "block", blockPath: "hero.title" });
    expect(readOpenTarget("?cms-collection=news").target)
      .toEqual({ kind: "collection", collectionKey: "news" });
    expect(readOpenTarget("?cms-record=news/congress-2026").target)
      .toEqual({ kind: "record", collectionKey: "news", slug: "congress-2026" });
    expect(readOpenTarget("?cms-panel=orders").target)
      .toEqual({ kind: "panel", panelId: "orders" });
  });

  it("splits a record at the first slash only, so a slug may hold more", () => {
    expect(readOpenTarget("?cms-record=news/2026/congress").target)
      .toEqual({ kind: "record", collectionKey: "news", slug: "2026/congress" });
  });

  it("refuses a record that is not a pair, pointing at the param that is", () => {
    const { target, warning } = readOpenTarget("?cms-record=news");
    expect(target).toBeNull();
    expect(warning).toContain("cms-collection");
  });

  it("opens one thing when handed several, and says which it ignored", () => {
    const { target, warning } = readOpenTarget("?cms-panel=orders&cms-block=hero.title");
    // Declared order decides, so the same link always opens the same thing.
    expect(target).toEqual({ kind: "block", blockPath: "hero.title" });
    expect(warning).toContain("cms-panel");
  });

  it("ignores an empty marker rather than opening an area with no name", () => {
    expect(readOpenTarget("?cms-panel=").target).toBeNull();
  });

  it("leaves the value decoded, so a slug with punctuation survives", () => {
    expect(readOpenTarget("?cms-record=news%2Fa%20b").target)
      .toEqual({ kind: "record", collectionKey: "news", slug: "a b" });
  });
});
