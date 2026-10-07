/**
 * A server-rendered `<CollectionItem>` reads its record in the language
 * `<CmsPage>` published, the way `CollectionItem.metadata` does, so the two
 * reads are one request and show the same translation. It never falls back to
 * the request, which would make the route dynamic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const headerReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => {
    headerReads.count += 1;
    return new Headers([["x-pathname", "/en/news/yeni-urun"]]);
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw Object.assign(new Error("not found"), { digest: "NEXT_NOT_FOUND" }); },
  permanentRedirect: () => { throw new Error("unexpected redirect"); },
}));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));
// Stand in for the `react-server` build's `cache`, which plain Node React lacks.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cache: (fn) => {
      let value;
      let filled = false;
      return (...args) => {
        if (!filled) { value = fn(...args); filled = true; }
        return value;
      };
    },
  };
});

const ITEM = { id: "1", collectionKey: "news", slug: "new-product", locale: "en", data: {}, version: 1 };

/** @param {string[]} [locales] */
async function factory(locales = ["tr", "en"]) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");
  /** @type {*[]} */
  const reads = [];
  const made = createCmsPage({
    config: { baseUrl: "https://api.test", locales },
    Provider: () => null,
    collections: { CollectionProvider: () => null, CollectionRecord: (props) => props, CollectionRows: () => null },
    transport: {
      getSiteContent: async () => ({ pages: [], global: [] }),
      getCollectionItem: async (key, slug, opts) => {
        reads.push(opts.locale);
        return ITEM;
      },
    },
  });
  return { ...made, reads };
}

/** Render the shell's Suspense child, the way React would. */
const renderItem = (el) => el.props.children.type(el.props.children.props);

beforeEach(() => { headerReads.count = 0; });

describe("a server collection item's language", () => {
  it("is the one <CmsPage> published", async () => {
    const { CmsPage, CollectionItem, reads } = await factory();
    await CmsPage({ locale: "en", children: null });
    await renderItem(CollectionItem({ collection: "news", slug: "yeni-urun", children: null }));
    expect(reads).toEqual(["en"]);
    expect(headerReads.count).toBe(0);
  });

  it("can be pinned, or left out with null", async () => {
    const { CmsPage, CollectionItem, reads } = await factory();
    await CmsPage({ locale: "en", children: null });
    await renderItem(CollectionItem({ collection: "news", slug: "yeni-urun", locale: "tr", children: null }));
    await renderItem(CollectionItem({ collection: "news", slug: "yeni-urun", locale: null, children: null }));
    expect(reads).toEqual(["tr", undefined]);
  });

  it("is left out, without reading the request, when nothing was published yet, and dev says so", async () => {
    const { CollectionItem, reads } = await factory();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderItem(CollectionItem({ collection: "news", slug: "yeni-urun", children: null }));
    expect(reads).toEqual([undefined]);
    expect(headerReads.count).toBe(0);
    expect(warn.mock.calls.some((call) => String(call[0]).includes("rendered before <CmsPage>"))).toBe(true);
    warn.mockRestore();
  });

  it("answers a language the site does not have with a 404, without reading", async () => {
    const { CmsPage, CollectionItem, reads } = await factory();
    await expect(CmsPage({ locale: "wp-login.php", children: null })).rejects.toThrow("not found");
    await expect(renderItem(CollectionItem({ collection: "news", slug: "x", children: null }))).rejects.toThrow("not found");
    expect(reads).toEqual([]);
  });

  it("is left out on a single-language site", async () => {
    const { CmsPage, CollectionItem, reads } = await factory([]);
    await CmsPage({ children: null });
    await renderItem(CollectionItem({ collection: "news", slug: "yeni-urun", children: null }));
    expect(reads).toEqual([undefined]);
  });
});
