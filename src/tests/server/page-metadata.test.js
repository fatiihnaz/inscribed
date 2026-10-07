/**
 * `CmsPage.metadata` and `CmsPage.siteMetadata`: a page's `seo.*` blocks turned
 * into Next metadata, falling back to the defaults in code, then to the layout.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));

const SITE_URL = "https://site.test";

/** @param {string} blockPath @param {*} value */
const block = (blockPath, value) => ({ blockPath, blockType: "ShortText", value, sortOrder: 1, version: 1 });

const SITE = {
  tr: {
    pages: [
      {
        slug: "/",
        blocks: [block("seo.title", "Acme Mühendislik"), block("seo.image", { src: "https://cdn.test/home.png", alt: "Kampüs" })],
      },
      {
        slug: "/hakkinda",
        blocks: [
          block("seo.title", "Hakkında"),
          block("seo.description", "Bölümün   tarihi\nve kadrosu."),
          block("seo.image", { src: "", alt: "" }),
          block("seo.noindex", false),
        ],
      },
      { slug: "/arama/[q]", blocks: [block("seo.title", "Arama")] },
    ],
    global: [],
  },
  en: {
    pages: [
      { slug: "/", blocks: [block("seo.title", "Acme Engineering")] },
      {
        slug: "/hakkinda",
        blocks: [block("seo.title", ""), block("seo.description", ""), block("seo.noindex", true)],
      },
    ],
    global: [],
  },
};

/** @param {{ siteUrl?: string | null, locales?: string[] }} [opts] */
async function factory({ siteUrl = SITE_URL, locales = ["tr", "en"] } = {}) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");
  return createCmsPage({
    config: { baseUrl: "https://api.test", locales, ...(siteUrl ? { siteUrl } : null) },
    transport: { getSiteContent: async ({ locale }) => SITE[locale ?? "tr"] },
    Provider: () => null,
  });
}

/** @param {*} params */
const props = (params) => ({ params: Promise.resolve(params) });

describe("CmsPage.metadata", () => {
  it("reads the page's seo blocks in the route's language", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/hakkinda")(props({ locale: "tr" }));

    expect(meta.title).toBe("Hakkında");
    expect(meta.description).toBe("Bölümün tarihi ve kadrosu.");
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates).toEqual({
      canonical: "https://site.test/hakkinda",
      languages: {
        tr: "https://site.test/hakkinda",
        en: "https://site.test/en/hakkinda",
        "x-default": "https://site.test/hakkinda",
      },
    });
  });

  it("falls back to the code's default for that language when a field is empty", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/hakkinda", {
      title: { tr: "Hakkında", en: "About" },
    })(props({ locale: "en" }));

    expect(meta.title).toBe("About");
    expect(meta.alternates.canonical).toBe("https://site.test/en/hakkinda");
  });

  it("drops the description rather than inheriting the site-wide one", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/hakkinda")(props({ locale: "en" }));
    expect(meta.description).toBe(null);
  });

  it("keeps a noindex page out of search but lets its links be followed", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/hakkinda")(props({ locale: "en" }));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("carries the layout's Open Graph over, since Next replaces it whole", async () => {
    const { CmsPage } = await factory();
    const parent = Promise.resolve({
      openGraph: { siteName: "Acme", type: "website", images: [{ url: "https://cdn.test/home.png" }] },
    });
    const meta = await CmsPage.metadata("/hakkinda")(props({ locale: "tr" }), parent);

    expect(meta.openGraph).toEqual({
      siteName: "Acme",
      type: "website",
      images: [{ url: "https://cdn.test/home.png" }],
      title: "Hakkında",
      description: "Bölümün tarihi ve kadrosu.",
      url: "https://site.test/hakkinda",
    });
  });

  it("writes the home page's title out whole, outside the site's template", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/")(props({ locale: "tr" }));
    expect(meta.title).toEqual({ absolute: "Acme Mühendislik" });
    expect(meta.openGraph.images).toEqual([{ url: "https://cdn.test/home.png", alt: "Kampüs" }]);
    expect(meta.alternates.canonical).toBe("https://site.test");
  });

  it("puts the route's params into a template page's addresses", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.metadata("/arama/[q]")(props({ locale: "en", q: "a b" }));
    expect(meta.alternates.canonical).toBe("https://site.test/en/arama/a%20b");
  });

  it("answers a language the site does not have with nothing", async () => {
    const { CmsPage } = await factory();
    expect(await CmsPage.metadata("/hakkinda")(props({ locale: "xx" }))).toEqual({});
  });

  it("gives a single-language site a canonical and no hreflang", async () => {
    const { CmsPage } = await factory({ locales: [] });
    const meta = await CmsPage.metadata("/hakkinda")(props({}));
    expect(meta.alternates).toEqual({ canonical: "https://site.test/hakkinda" });
  });

  it("refuses a first argument that is not a slug", async () => {
    const { CmsPage } = await factory();
    expect(() => CmsPage.metadata("hakkinda")).toThrow('a path starting with "/"');
  });
});

describe("CmsPage.siteMetadata", () => {
  it("sets the base address, the title template and the home page's share image", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.siteMetadata({ siteName: "Acme" })(props({ locale: "tr" }));

    expect(meta.metadataBase).toEqual(new URL(SITE_URL));
    expect(meta.title).toEqual({ default: "Acme", template: "%s | Acme" });
    expect(meta.openGraph).toEqual({
      type: "website",
      siteName: "Acme",
      images: [{ url: "https://cdn.test/home.png", alt: "Kampüs" }],
    });
  });

  it("names the site per language", async () => {
    const { CmsPage } = await factory();
    const meta = await CmsPage.siteMetadata({ siteName: { tr: "Acme TR", en: "Acme EN" } })(props({ locale: "en" }));
    expect(meta.title).toEqual({ default: "Acme EN", template: "%s | Acme EN" });
    expect(meta.openGraph.images).toBeUndefined();
  });

  it("leaves out what it has no input for", async () => {
    const { CmsPage } = await factory({ siteUrl: null });
    const meta = await CmsPage.siteMetadata()(props({ locale: "en" }));
    expect(meta).toEqual({ openGraph: { type: "website" } });
  });
});
