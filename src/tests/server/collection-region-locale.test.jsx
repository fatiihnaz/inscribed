/**
 * A server-rendered `<CollectionRegion>` takes its language from `<CmsPage>`,
 * not from the request.
 *
 * The distinction is the whole point: `headers()` is a dynamic API, so a page
 * carrying one region used to opt the entire route out of static rendering,
 * which is exactly what `<CmsPage>` goes out of its way to avoid. The header
 * count is therefore the assertion, not an implementation detail.
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
// Stand in for the `react-server` build's `cache`, which plain Node React lacks.
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

/** Render the shell's Suspense child, the way React would. */
const renderRegion = (el) => el.props.children.type(el.props.children.props);

beforeEach(() => { headerReads.count = 0; });

describe("a server collection region's language", () => {
  it("comes from <CmsPage>, so the route reads no headers at all", async () => {
    const { CmsPage, CollectionRegion, getCollection } = factory(
      createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] }),
    );
    await CmsPage({ locale: "en", children: null });
    await renderRegion(CollectionRegion({ collection: "news", limit: 5, children: null }));

    expect(headerReads.count).toBe(0);
    expect(getCollection.mock.calls[0][1]).toEqual({ limit: 5, locale: "en" });
  });

  it("is omitted on a single-language site, still without a header read", async () => {
    const { CmsPage, CollectionRegion, getCollection } = factory(createCmsConfig({ baseUrl: BASE }));
    await CmsPage({ children: null });
    await renderRegion(CollectionRegion({ collection: "news", children: null }));

    expect(headerReads.count).toBe(0);
    expect(getCollection.mock.calls[0][1]).toBeUndefined();
  });

  it("can be pinned per region, which wins over the page's", async () => {
    const { CmsPage, CollectionRegion, getCollection } = factory(
      createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] }),
    );
    await CmsPage({ locale: "en", children: null });
    await renderRegion(CollectionRegion({ collection: "news", locale: "tr", children: null }));

    expect(headerReads.count).toBe(0);
    expect(getCollection.mock.calls[0][1]).toEqual({ locale: "tr" });
  });
});
