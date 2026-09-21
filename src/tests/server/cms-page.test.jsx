/**
 * `<CmsPage>` reads the whole site and never the request, which is what lets
 * every route under it prerender. These pin the two halves: the read it hands
 * the provider, and the header it must not touch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const headerReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => {
    headerReads.count += 1;
    return new Headers();
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw Object.assign(new Error("not found"), { digest: "NEXT_NOT_FOUND" }); },
  permanentRedirect: () => { throw new Error("unexpected redirect"); },
}));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));

import { createCmsPage } from "../../server/cms-page.jsx";
import { createCmsConfig } from "../../shared/config.js";
import { CmsApiError } from "../../shared/contracts/errors.js";

const BASE = "https://api.test";

const block = (blockPath) => ({ blockPath, blockType: "ShortText", value: blockPath, version: 1, sortOrder: 1 });

const siteFor = (locale) => ({
  pages: [{ slug: "/", blocks: [block(`hero.title.${locale ?? "single"}`)] }],
  global: [{ slug: "__global", blocks: [block("footer.copyright")] }],
});

/** `CmsPage` returns the provider element; its props are what it decided. */
function Provider() {
  return null;
}

function factory(config, transport = {}) {
  return createCmsPage({
    config,
    Provider,
    transport: {
      getSiteContent: vi.fn(async (opts) => siteFor(opts?.locale ?? null)),
      ...transport,
    },
  });
}

beforeEach(() => {
  headerReads.count = 0;
});

describe("what CmsPage hands the provider", () => {
  it("is the whole site in the segment's language, and nothing per page", async () => {
    const config = createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] });
    const { CmsPage } = factory(config);
    const { props: providerProps } = await CmsPage({ locale: "en", children: null });

    expect(providerProps.initialSite.pages.map((p) => p.slug)).toEqual(["/"]);
    expect(providerProps.initialSite.global.map((p) => p.slug)).toEqual(["__global"]);
    expect(providerProps.initialSite.pages[0].blocks[0].blockPath).toBe("hero.title.en");
    expect(providerProps.config).toBe(config);
    expect(providerProps).not.toHaveProperty("initialBlocks");
  });

  it("reads a single-language site with no locale at all", async () => {
    const { CmsPage } = factory(createCmsConfig({ baseUrl: BASE }));
    const { props: providerProps } = await CmsPage({ children: null });
    expect(providerProps.initialSite.pages[0].blocks[0].blockPath).toBe("hero.title.single");
  });

  it("never reads the request headers", async () => {
    // A header read opts the route out of static rendering, so this is the
    // whole point of the read being keyed on the segment rather than the URL.
    const { CmsPage } = factory(createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] }));
    await CmsPage({ locale: "tr", children: null });
    expect(headerReads.count).toBe(0);
  });

  it("renders the site empty, uncached, when the backend is down outside a build", async () => {
    const { CmsPage } = factory(createCmsConfig({ baseUrl: BASE }), {
      getSiteContent: async () => { throw new CmsApiError({ status: 503, detail: "down" }); },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { props: providerProps } = await CmsPage({ children: null });
    warn.mockRestore();
    expect(providerProps.initialSite).toEqual({ pages: [], global: [] });
  });
});

describe("the locale a localized site needs", () => {
  const config = createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] });

  it("must be passed, and the error says where from", async () => {
    const { CmsPage } = factory(config);
    await expect(CmsPage({ children: null })).rejects.toThrow(/app\/\[locale\]\/layout/);
  });

  it("must be one the site serves, or the route is not found", async () => {
    const { CmsPage } = factory(config);
    await expect(CmsPage({ locale: "xx", children: null })).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });
  });
});
