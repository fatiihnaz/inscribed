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
