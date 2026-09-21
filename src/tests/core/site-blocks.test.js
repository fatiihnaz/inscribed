import { describe, it, expect } from "vitest";

import { reseedSite, seedSite, siteSlugs } from "../../core/site-blocks.js";
import { readBlock } from "../../core/blocks.js";
import { globalsKey, routeKey } from "../../shared/route.js";

/**
 * The site seed is what a page renders from before any fetch, so what it puts
 * where decides whether a route paints complete.
 *
 * The shape is the point: a page holds only its own blocks and the globals get
 * one entry, so a header reaches every route without being copied into each and
 * a route the site has nothing for still has one. Every block carries the slug
 * it saves back to either way.
 */

const block = (blockPath, value = blockPath, version = 1) => ({
  blockPath,
  blockType: "ShortText",
  value,
  draftValue: null,
  version,
  sortOrder: 1,
});

const site = {
  pages: [
    { slug: "/", blocks: [block("hero.title", "Ana sayfa")] },
    { slug: "/about", blocks: [block("hero.title", "Hakkında")] },
  ],
  global: [{ slug: "__global", blocks: [block("footer.copyright", "© 2026")] }],
};

describe("seedSite", () => {
  it("gives every page an entry under its route key", () => {
    const store = seedSite(site, "tr");
    expect(store.get(routeKey("/about", "tr")).get("hero.title").value).toBe("Hakkında");
    expect(store.get(routeKey("/", "tr")).get("hero.title").value).toBe("Ana sayfa");
  });

  it("holds the globals once, apart from any route", () => {
    const store = seedSite(site, "tr");
    expect(store.get(globalsKey("tr")).get("footer.copyright").value).toBe("© 2026");
    // No page carries a copy, and the global slug is not a route.
    expect(store.get(routeKey("/about", "tr")).has("footer.copyright")).toBe(false);
    expect(store.has(routeKey("__global", "tr"))).toBe(false);
  });

  it("stamps each block with the slug it saves back to", () => {
    const store = seedSite(site, "tr");
    expect(store.get(routeKey("/about", "tr")).get("hero.title")._slug).toBe("/about");
    expect(store.get(globalsKey("tr")).get("footer.copyright")._slug).toBe("__global");
  });

  it("keeps several global slugs apart, each saving to its own", () => {
    const store = seedSite({
      pages: [],
      global: [
        { slug: "__global", blocks: [block("footer.copyright")] },
        { slug: "__nav", blocks: [block("nav.home")] },
      ],
    }, null);
    const globals = store.get(globalsKey(null));
    expect(globals.get("footer.copyright")._slug).toBe("__global");
    expect(globals.get("nav.home")._slug).toBe("__nav");
  });

  it("keys without a locale on a single-language site", () => {
    expect(seedSite(site, null).has("/about")).toBe(true);
  });

  it("seeds nothing from nothing", () => {
    expect(seedSite(undefined, "tr").size).toBe(0);
    expect(seedSite({ pages: [], global: [] }, "tr").size).toBe(1);
  });
});

describe("a route the site has no entry for", () => {
  it("still resolves the globals, so a header is the same everywhere", () => {
    const store = seedSite(site, null);
    expect(readBlock(store, "/unsynced", globalsKey(null), "footer.copyright").value).toBe("© 2026");
    // Its own blocks are another matter: there are none, and nothing else's
    // may stand in for them.
    expect(readBlock(store, "/unsynced", globalsKey(null), "hero.title")).toBeUndefined();
  });
});

describe("reseedSite", () => {
  const published = seedSite(site, null);
  /** What the store looks like once an editor's own read has landed. */
  const withDrafts = new Map(published);
  withDrafts.set("/", new Map([
    ["hero.title", { ...block("hero.title", "Ana sayfa"), draftValue: "taslak" }],
  ]));
  withDrafts.set(globalsKey(null), new Map([
    ["footer.copyright", { ...block("footer.copyright", "© 2026"), _slug: "__global", draftValue: "© 2027" }],
  ]));

  it("keeps a draft whose block the incoming site says nothing new about", () => {
    const next = reseedSite(withDrafts, site, null);
    expect(next.get("/").get("hero.title").draftValue).toBe("taslak");
    // Globals are no exception: they are held apart, not treated apart.
    expect(next.get(globalsKey(null)).get("footer.copyright").draftValue).toBe("© 2027");
  });

  it("drops a draft whose block was published underneath it", () => {
    const republished = {
      pages: [{ slug: "/", blocks: [block("hero.title", "Yayınlandı", 2)] }],
      global: site.global,
    };
    const next = reseedSite(withDrafts, republished, null);
    expect(next.get("/").get("hero.title").value).toBe("Yayınlandı");
    expect(next.get("/").get("hero.title").draftValue ?? null).toBeNull();
  });

  it("leaves entries the incoming site says nothing about", () => {
    const next = reseedSite(withDrafts, { pages: [], global: [] }, null);
    expect(next.get("/about").get("hero.title").value).toBe("Hakkında");
  });
});

describe("siteSlugs", () => {
  it("lists the routes, and the globals are absent by construction", () => {
    expect([...siteSlugs(site)].sort()).toEqual(["/", "/about"]);
  });

  it("is empty for an empty site", () => {
    expect(siteSlugs(undefined).size).toBe(0);
  });
});
