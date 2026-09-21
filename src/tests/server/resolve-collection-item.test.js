/**
 * `resolveCollectionItem`: the detail-route half of renaming a record.
 *
 * A renamed record keeps answering to its old slug, so the read succeeds and
 * only the `slug` in the body says anything moved. These pin down that the
 * helper acts on that difference, and where it sends the visitor: the redirect
 * target is derived from the path actually requested, so a locale prefix rides
 * along without this knowing the site is localized.
 */
import { describe, it, expect, vi } from "vitest";

import { CmsApiError } from "../../shared/contracts/errors.js";

const requestHeaders = { current: new Headers() };

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));
// Both signal by throwing, the way Next's own do, so a caller that swallowed
// them would fail these rather than quietly rendering the wrong page.
vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    /** @type {*} */ (err).digest = "NEXT_NOT_FOUND";
    throw err;
  },
  permanentRedirect: (url) => {
    const err = new Error("NEXT_REDIRECT");
    /** @type {*} */ (err).digest = `NEXT_REDIRECT;replace;${url};308;`;
    throw err;
  },
}));

const ITEM = {
  id: "row-1",
  collectionKey: "news",
  slug: "yeni-adres",
  data: { title: "Haber" },
  version: 5,
  canEdit: true,
};

/**
 * Call the helper for a request at `pathname`, against a backend answering with
 * `item` (or throwing `error`).
 *
 * The module is re-imported per call because the missing-path warning is
 * latched once per process.
 *
 * @param {{
 *   pathname?: string,
 *   slug: string,
 *   item?: *,
 *   error?: *,
 *   options?: *,
 * }} args
 * @returns {Promise<{ item: * | null, redirectedTo: string | null, notFound: boolean, warned: boolean }>}
 */
async function run({ pathname = "/haber/eski-adres", slug, item = ITEM, error, options }) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");

  requestHeaders.current = new Headers(pathname ? { "x-pathname": pathname } : {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const { resolveCollectionItem } = createCmsPage({
    config: { baseUrl: "https://api.test" },
    transport: {
      getCollectionItem: async () => {
        if (error) throw error;
        return item;
      },
    },
    Provider: () => null,
  });

  let resolved = null;
  let redirectedTo = null;
  let missing = false;
  try {
    resolved = await resolveCollectionItem("news", slug, options);
  } catch (err) {
    const digest = String(/** @type {*} */ (err)?.digest ?? "");
    if (digest === "NEXT_NOT_FOUND") missing = true;
    else if (digest.startsWith("NEXT_REDIRECT")) redirectedTo = digest.split(";")[2];
    else throw err;
  }

  const warned = warn.mock.calls.some((call) =>
    String(call[0]).includes("could not build a redirect target"));
  warn.mockRestore();
  return { item: resolved, redirectedTo, notFound: missing, warned };
}

describe("a slug that is already canonical", () => {
  it("returns the record and redirects nowhere", async () => {
    const out = await run({ pathname: "/haber/yeni-adres", slug: "yeni-adres" });

    expect(out.redirectedTo).toBe(null);
    expect(out.notFound).toBe(false);
    expect(out.item.slug).toBe("yeni-adres");
  });
});

describe("a slug that turns out to be an old address", () => {
  it("redirects to the canonical one", async () => {
    const out = await run({ slug: "eski-adres" });
    expect(out.redirectedTo).toBe("/haber/yeni-adres");
  });

  it("keeps the locale prefix the visitor arrived under", async () => {
    // The middleware writes the pre-rewrite path, so the prefix is simply part
    // of what gets its last segment swapped.
    const out = await run({ pathname: "/en/haber/eski-adres", slug: "eski-adres" });
    expect(out.redirectedTo).toBe("/en/haber/yeni-adres");
  });

  it("lets an explicit path builder decide instead", async () => {
    const out = await run({
      slug: "eski-adres",
      options: { path: (s) => `/archive/${s}/read` },
    });
    expect(out.redirectedTo).toBe("/archive/yeni-adres/read");
  });

  it("encodes a slug that needs it", async () => {
    const out = await run({
      slug: "eski-adres",
      item: { ...ITEM, slug: "yeni adres" },
    });
    expect(out.redirectedTo).toBe("/haber/yeni%20adres");
  });

  it("renders at the old address rather than guessing when there is no path", async () => {
    // No middleware, so the header defaulted to "/" and there is no segment to
    // swap. Redirecting on a guess would send visitors nowhere.
    const out = await run({ pathname: "", slug: "eski-adres" });

    expect(out.redirectedTo).toBe(null);
    expect(out.item.slug).toBe("yeni-adres");
    expect(out.warned).toBe(true);
  });
});

/**
 * Build a factory with collections wired, then run the `generateMetadata` its
 * `CollectionItem.metadata(...args)` produces.
 *
 * @param {{ pathname?: string, slug?: string, params?: *, item?: *, error?: *, args: *[] }} opts
 */
async function runMetadata({ pathname = "/haber/eski-adres", slug, params, item = ITEM, error, args }) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");

  requestHeaders.current = new Headers(pathname ? { "x-pathname": pathname } : {});

  const { CollectionItem } = createCmsPage({
    config: { baseUrl: "https://api.test" },
    transport: {
      getCollectionItem: async () => {
        if (error) throw error;
        return item;
      },
    },
    Provider: () => null,
    collections: {
      CollectionProvider: () => null,
      CollectionRecord: () => null,
      CollectionRows: () => null,
    },
  });

  const generateMetadata = CollectionItem.metadata(...args);

  let meta = null;
  let redirectedTo = null;
  let missing = false;
  try {
    meta = await generateMetadata({ params: Promise.resolve(params ?? { slug }) });
  } catch (err) {
    const digest = String(/** @type {*} */ (err)?.digest ?? "");
    if (digest === "NEXT_NOT_FOUND") missing = true;
    else if (digest.startsWith("NEXT_REDIRECT")) redirectedTo = digest.split(";")[2];
    else throw err;
  }
  return { meta, redirectedTo, notFound: missing };
}

describe("CollectionItem.metadata", () => {
  it("names the record's own address as the canonical one", async () => {
    const out = await runMetadata({
      pathname: "/haber/yeni-adres", slug: "yeni-adres", args: ["news"],
    });
    expect(out.meta.alternates.canonical).toBe("/haber/yeni-adres");
  });

  it("keeps the fields the caller mapped off the record", async () => {
    const out = await runMetadata({
      pathname: "/haber/yeni-adres",
      slug: "yeni-adres",
      args: ["news", (record) => ({ title: record.data.title })],
    });

    expect(out.meta.title).toBe("Haber");
    expect(out.meta.alternates.canonical).toBe("/haber/yeni-adres");
  });

  it("settles the route before building anything", async () => {
    // The redirect is the whole reason this lives here rather than in the page
    // body, so it has to happen without the caller writing a line about it.
    const out = await runMetadata({ slug: "eski-adres", args: ["news"] });

    expect(out.redirectedTo).toBe("/haber/yeni-adres");
    expect(out.meta).toBe(null);
  });

  it("404s a slug with no record behind it", async () => {
    const out = await runMetadata({
      slug: "yok",
      error: new CmsApiError({ status: 404, detail: "Not found" }),
      args: ["news"],
    });
    expect(out.notFound).toBe(true);
  });

  it("still names the canonical address when the redirect could not happen", async () => {
    // No middleware, so there is no path to redirect to. The canonical link is
    // what keeps the two addresses from competing in that case.
    const out = await runMetadata({ pathname: "", slug: "eski-adres", args: ["news"] });

    expect(out.redirectedTo).toBe(null);
    expect(out.meta.alternates.canonical).toBeUndefined();
  });

  it("reads another route segment when told which", async () => {
    const out = await runMetadata({
      pathname: "/urun/yeni-adres",
      params: { handle: "yeni-adres" },
      args: ["news", { param: "handle" }],
    });
    expect(out.meta.alternates.canonical).toBe("/urun/yeni-adres");
  });

  it("says which segment it was looking for when the route has none", async () => {
    await expect(runMetadata({ params: {}, args: ["news"] })).rejects.toThrow('no "slug"');
  });

  it("lets the caller keep its own alternates", async () => {
    const out = await runMetadata({
      pathname: "/haber/yeni-adres",
      slug: "yeni-adres",
      args: ["news", () => ({ alternates: { languages: { en: "/en/news/x" } } })],
    });

    expect(out.meta.alternates.canonical).toBe("/haber/yeni-adres");
    expect(out.meta.alternates.languages).toEqual({ en: "/en/news/x" });
  });
});

/**
 * A detail route is static only while nothing on it reads the request, and the
 * canonical address is the last thing that did. These pin the escape hatch that
 * makes it optional, and the params helper that gives the route pages to build.
 */
describe("keeping a detail route static", () => {
  /** @returns {Promise<{ headerReads: number, canonical: string }>} */
  async function metadataFor({ locale, path }) {
    vi.resetModules();
    const { createCmsPage } = await import("../../server/cms-page.jsx");
    let headerReads = 0;
    requestHeaders.current = new Proxy(new Headers({ "x-pathname": "/en/news/eski" }), {
      get(target, key) {
        if (key === "get") headerReads += 1;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const { CollectionItem } = createCmsPage({
      config: { baseUrl: "https://api.test", locales: ["tr", "en"] },
      transport: { getCollectionItem: async () => ITEM },
      Provider: () => null,
      collections: {
        CollectionProvider: () => null,
        CollectionRecord: () => null,
        CollectionRows: () => null,
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The canonical slug, so the redirect stays out of the way: what this is
    // about is where the canonical address comes from, not the rename.
    const meta = await CollectionItem.metadata("news", path ? { path } : undefined)({
      params: { slug: ITEM.slug, locale },
    });
    warn.mockRestore();
    return { headerReads, canonical: meta.alternates.canonical };
  }

  it("hands the route's language to the path builder, and reads no header", async () => {
    const out = await metadataFor({
      locale: "en",
      path: (slug, { locale }) => (locale === "tr" ? `/haber/${slug}` : `/${locale}/news/${slug}`),
    });
    expect(out.canonical).toBe("/en/news/yeni-adres");
    expect(out.headerReads).toBe(0);
  });

  it("falls back to the request without one, which is what costs the route its static render", async () => {
    const out = await metadataFor({ locale: "en" });
    expect(out.canonical).toBe("/en/news/yeni-adres");
    expect(out.headerReads).toBeGreaterThan(0);
  });

  it("hands that language to the redirect too, before anything <CmsPage> publishes is there", async () => {
    // `generateMetadata` renders beside the layout, not under it, so the
    // request-scoped slot can still be empty when the redirect is built. The
    // segment's `locale` is what the canonical link already uses; the redirect
    // from an old address must not fall back to the default language's path.
    vi.resetModules();
    const { createCmsPage } = await import("../../server/cms-page.jsx");
    requestHeaders.current = new Headers({ "x-pathname": "/en/news/eski-adres" });
    const { CollectionItem } = createCmsPage({
      config: { baseUrl: "https://api.test", locales: ["tr", "en"] },
      transport: { getCollectionItem: async () => ITEM },
      Provider: () => null,
      collections: { CollectionProvider: () => null, CollectionRecord: () => null, CollectionRows: () => null },
    });
    const path = (slug, { locale }) => (!locale || locale === "tr" ? `/haber/${slug}` : `/${locale}/news/${slug}`);
    let redirectedTo = null;
    try {
      await CollectionItem.metadata("news", { path })({ params: { slug: "eski-adres", locale: "en" } });
    } catch (err) {
      redirectedTo = String(/** @type {*} */ (err)?.digest ?? "").split(";")[2] ?? null;
    }
    expect(redirectedTo).toBe("/en/news/yeni-adres");
  });
});

describe("CollectionItem.staticParams", () => {
  /** A backend holding `total` records, answered a window at a time. */
  function paged(total) {
    const rows = Array.from({ length: total }, (_, i) => ({ ...ITEM, slug: `haber-${i}` }));
    const calls = [];
    return {
      calls,
      transport: {
        getCollectionItem: async () => ITEM,
        getCollection: async (key, params) => {
          calls.push(params ?? {});
          const offset = params?.offset ?? 0;
          const limit = params?.limit ?? total;
          return { items: rows.slice(offset, offset + limit), total, offset, limit };
        },
      },
    };
  }

  async function factoryWith(transport) {
    vi.resetModules();
    const { createCmsPage } = await import("../../server/cms-page.jsx");
    return createCmsPage({
      config: { baseUrl: "https://api.test", locales: ["tr", "en"] },
      transport,
      Provider: () => null,
      collections: {
        CollectionProvider: () => null,
        CollectionRecord: () => null,
        CollectionRows: () => null,
      },
    });
  }

  it("lists every slug, paging through the collection", async () => {
    const backend = paged(250);
    const { CollectionItem } = await factoryWith(backend.transport);
    const params = await CollectionItem.staticParams("news")({ params: { locale: "tr" } });

    expect(params).toHaveLength(250);
    expect(params[0]).toEqual({ slug: "haber-0" });
    expect(backend.calls).toHaveLength(3);
    // The language comes from the segment Next is building, not from a request.
    expect(backend.calls[0].locale).toBe("tr");
  });

  it("names the segment it was told to", async () => {
    const backend = paged(2);
    const { CollectionItem } = await factoryWith(backend.transport);
    const params = await CollectionItem.staticParams("news", { param: "id" })({});
    expect(params).toEqual([{ id: "haber-0" }, { id: "haber-1" }]);
  });

  it("stops at max, leaving the rest to render on demand", async () => {
    const backend = paged(500);
    const { CollectionItem } = await factoryWith(backend.transport);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const params = await CollectionItem.staticParams("news", { max: 120, pageSize: 50 })({});
    const warned = warn.mock.calls.some(([m]) => String(m).includes("stopped at 120 of 500"));
    warn.mockRestore();

    expect(params).toHaveLength(120);
    expect(warned).toBe(true);
  });

  it("fails the build rather than leave the route with no pages", async () => {
    const { CollectionItem } = await factoryWith({
      getCollectionItem: async () => ITEM,
      getCollection: async () => { throw new CmsApiError({ status: 503, detail: "down" }); },
    });
    await expect(CollectionItem.staticParams("news")({})).rejects.toThrow("down");
  });
});

describe("reaching the resolver", () => {
  it("hangs off CollectionItem, so exporting the component is enough", async () => {
    // The wiring step this removes: without it a detail route needs the factory
    // module to destructure one more name before the page can import it.
    vi.resetModules();
    const { createCmsPage } = await import("../../server/cms-page.jsx");

    const factory = createCmsPage({
      config: { baseUrl: "https://api.test" },
      transport: { getCollectionItem: async () => ITEM },
      Provider: () => null,
      collections: {
        CollectionProvider: () => null,
        CollectionRecord: () => null,
        CollectionRows: () => null,
      },
    });

    expect(factory.CollectionItem.resolve).toBe(factory.resolveCollectionItem);
  });

  it("is absent when collections were never wired up", async () => {
    vi.resetModules();
    const { createCmsPage } = await import("../../server/cms-page.jsx");

    const factory = createCmsPage({
      config: { baseUrl: "https://api.test" },
      transport: { getCollectionItem: async () => ITEM },
      Provider: () => null,
    });

    expect(factory.CollectionItem).toBeUndefined();
    expect(typeof factory.resolveCollectionItem).toBe("function");
  });
});

describe("failures", () => {
  it("404s a slug with no record behind it", async () => {
    const out = await run({
      slug: "yok",
      error: new CmsApiError({ status: 404, detail: "Not found" }),
    });
    expect(out.notFound).toBe(true);
  });

  it("lets anything else through rather than rendering a page without the record", async () => {
    await expect(run({
      slug: "eski-adres",
      error: new CmsApiError({ status: 500, detail: "boom" }),
    })).rejects.toThrow("boom");
  });
});
