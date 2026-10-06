/**
 * A server `<CollectionRegion>` that renders before `<CmsPage>` has published
 * the route's language. Next renders a page beside its layout rather than
 * inside it, so a synchronous page under a layout that awaits `params` gets
 * here first; the only way left to learn the language is the request, and
 * reading it makes the route dynamic.
 *
 * Its own file because the `cache` stand-in keeps one slot for the whole file,
 * and every test here needs it empty.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const headerReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => {
    headerReads.count += 1;
    return new Headers([["x-pathname", "/en/haberler"]]);
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw Object.assign(new Error("not found"), { digest: "NEXT_NOT_FOUND" }); },
  permanentRedirect: () => { throw new Error("unexpected redirect"); },
}));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cache: (fn) => {
      let value;
      let filled = false;
      return () => {
        if (!filled) { value = fn(); filled = true; }
        return value;
      };
    },
  };
});

import { createCmsPage } from "../../server/cms-page.jsx";
import { createCmsConfig } from "../../shared/config.js";

const BASE = "https://api.test";

function factory(config) {
  const getCollection = vi.fn(async () => ({ items: [], total: 0, offset: 0, limit: 5 }));
  const made = createCmsPage({
    config,
    Provider: () => null,
    collections: {
      CollectionProvider: () => null,
      CollectionRecord: () => null,
      CollectionRows: (props) => props,
    },
    transport: { getSiteContent: async () => ({ pages: [] }), getCollection },
  });
  return { ...made, getCollection };
}

const renderRegion = (el) => el.props.children.type(el.props.children.props);

beforeEach(() => { headerReads.count = 0; });

describe("a server collection region that renders before <CmsPage>", () => {
  it("reads no header on a single-language site, which has no language to find", async () => {
    const { CollectionRegion, getCollection } = factory(createCmsConfig({ baseUrl: BASE }));
    await renderRegion(CollectionRegion({ collection: "news", children: null }));

    expect(headerReads.count).toBe(0);
    expect(getCollection.mock.calls[0][1]).toBeUndefined();
  });

  it("falls back to the request on a localized site, and says how to keep the route static", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { CollectionRegion, getCollection } = factory(
      createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] }),
    );
    await renderRegion(CollectionRegion({ collection: "news", limit: 5, children: null }));

    expect(headerReads.count).toBe(1);
    expect(getCollection.mock.calls[0][1]).toEqual({ limit: 5, locale: "en" });
    const said = warn.mock.calls.map(([m]) => String(m)).join("\n");
    expect(said).toContain("await its params");
    expect(said).toContain("locale={");
    warn.mockRestore();
  });
});
