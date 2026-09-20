import { describe, it, expect } from "vitest";

import { seedSitePages, siteSlugs } from "../../core/site-blocks.js";
import { routeKey } from "../../shared/route.js";

/**
 * The site seed is what a page renders from before any fetch, so what it puts
 * where decides whether a route paints complete: every page gets an entry, the
 * global slug is folded into each, and every block knows the slug it saves to.
 */

const block = (blockPath, value = blockPath) => ({
  blockPath,
  blockType: "ShortText",
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
});

const config = { globalSlug: "__global" };

const pages = [
  { slug: "/", blocks: [block("hero.title", "Ana sayfa")] },
  { slug: "/about", blocks: [block("hero.title", "Hakkında")] },
  { slug: "__global", blocks: [block("footer.copyright", "© 2026")] },
];

describe("seedSitePages", () => {
  it("gives every page an entry under its route key", () => {
    const store = seedSitePages(pages, "tr", config);
    expect([...store.keys()].sort()).toEqual([routeKey("/", "tr"), routeKey("/about", "tr")].sort());
    expect(store.get(routeKey("/about", "tr")).get("hero.title").value).toBe("Hakkında");
  });

  it("folds the global slug into each page and stamps the source slug", () => {
    const store = seedSitePages(pages, "tr", config);
    const about = store.get(routeKey("/about", "tr"));
    expect(about.get("footer.copyright")._slug).toBe("__global");
    expect(about.get("hero.title")._slug).toBe("/about");
  });

  it("gives the global slug no entry of its own", () => {
    // It is not a route: nothing renders it, and matching a pathname against
    // it would be a mistake.
    const store = seedSitePages(pages, "tr", config);
    expect(store.has(routeKey("__global", "tr"))).toBe(false);
  });

  it("keys without a locale on a single-language site", () => {
    const store = seedSitePages(pages, null, config);
    expect(store.has("/about")).toBe(true);
  });

  it("seeds nothing from nothing", () => {
    expect(seedSitePages(undefined, "tr", config).size).toBe(0);
    expect(seedSitePages([], "tr", config).size).toBe(0);
  });
});

describe("siteSlugs", () => {
  it("lists the pages and leaves the global slug out", () => {
    expect([...siteSlugs(pages, config)].sort()).toEqual(["/", "/about"]);
  });

  it("is empty for an empty site", () => {
    expect(siteSlugs(undefined, config).size).toBe(0);
  });
});
