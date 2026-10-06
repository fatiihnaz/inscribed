/**
 * A route whose language segment names no language the site has: a path with a
 * dot skips the proxy and reaches `app/[locale]` as it is (`/wp-login.php`).
 * `<CmsPage>` answers it with a 404, and a server `<CollectionRegion>` on the
 * page, which Next renders beside the layout, has to answer the same way. It
 * used to find nothing published and read the request instead, which a
 * prerendered route turns into a 500 at runtime.
 *
 * Its own file because the `cache` stand-in keeps one slot for the whole file.
 */
import { describe, it, expect, vi } from "vitest";

const headerReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => {
    headerReads.count += 1;
    return new Headers([["x-pathname", "/wp-login.php"]]);
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

const renderRegion = (el) => el.props.children.type(el.props.children.props);

describe("a server collection region on a route with an unknown language", () => {
  it("answers with the same 404 as <CmsPage>, without reading the request or the collection", async () => {
    const getCollection = vi.fn(async () => ({ items: [], total: 0, offset: 0, limit: 5 }));
    const { CmsPage, CollectionRegion } = createCmsPage({
      config: createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"] }),
      Provider: () => null,
      collections: {
        CollectionProvider: () => null,
        CollectionRecord: () => null,
        CollectionRows: (props) => props,
      },
      transport: { getSiteContent: async () => ({ pages: [] }), getCollection },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(CmsPage({ locale: "wp-login.php", children: null })).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });
    await expect(renderRegion(CollectionRegion({ collection: "news", children: null })))
      .rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });

    expect(headerReads.count).toBe(0);
    expect(getCollection).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
