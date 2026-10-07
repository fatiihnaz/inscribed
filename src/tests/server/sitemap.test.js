/**
 * `CmsPage.sitemap`: pages from the site read, records from collections with an
 * `seo.path`, every language with hreflang, and nothing that is noindex.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));

/** @param {string} blockPath @param {*} value */
const block = (blockPath, value) => ({ blockPath, blockType: "Bool", value, sortOrder: 1, version: 1 });

const SITES = {
  tr: {
    pages: [
      { slug: "/", blocks: [] },
      { slug: "/hakkinda", blocks: [block("seo.noindex", false)] },
      { slug: "/arama/[q]", blocks: [] },
      { slug: "/gizli", blocks: [] },
    ],
    global: [{ slug: "__global", blocks: [] }],
  },
  en: {
    pages: [
      { slug: "/", blocks: [] },
      { slug: "/hakkinda", blocks: [block("seo.noindex", true)] },
      { slug: "/arama/[q]", blocks: [] },
      { slug: "/gizli", blocks: [] },
    ],
    global: [],
  },
};

const NEWS = {
  tr: [
    { slug: "yeni-urun", locale: "tr", updatedAt: "2026-10-01T10:00:00Z", translations: [{ locale: "en", slug: "new-product" }], data: { cover: { src: "https://cdn.test/c.png", alt: "" } } },
    { slug: "gizli-haber", locale: "tr", updatedAt: "2026-10-02T10:00:00Z", translations: [{ locale: "en", slug: "hidden-news" }], data: { hidden: true } },
  ],
  en: [
    { slug: "new-product", locale: "en", updatedAt: "2026-10-03T10:00:00Z", translations: [{ locale: "tr", slug: "yeni-urun" }], data: {} },
    { slug: "hidden-news", locale: "en", updatedAt: "2026-10-04T10:00:00Z", translations: [{ locale: "tr", slug: "gizli-haber" }], data: {} },
  ],
};
// No languages: every language's read answers the same rows.
const STAFF = [{ slug: "ali", updatedAt: "2026-09-01T10:00:00Z", data: {} }];

/** @param {{ siteUrl?: string | null, failing?: boolean }} [opts] */
async function factory({ siteUrl = "https://site.test", failing = false } = {}) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");
  return createCmsPage({
    config: {
      baseUrl: "https://api.test",
      locales: ["tr", "en"],
      ...(siteUrl ? { siteUrl } : null),
      seo: {
        news: { path: "/news/[slug]", image: "cover", noindex: "hidden" },
        staff: { path: "/personel/[slug]" },
        tags: { title: "name" },
      },
    },
    transport: {
      getSiteContent: async ({ locale }) => {
        if (failing) throw new Error("backend down");
        return SITES[locale];
      },
      getCollection: async (key, params) => {
        const rows = key === "news" ? NEWS[params.locale] : STAFF;
        const offset = params.offset ?? 0;
        return { items: rows.slice(offset, offset + params.limit), total: rows.length, offset, limit: params.limit };
      },
    },
    Provider: () => null,
  });
}

describe("CmsPage.sitemap", () => {
  it("lists every page in every language with hreflang, leaving out templates, excluded and noindex pages", async () => {
    const { CmsPage } = await factory();
    const entries = await CmsPage.sitemap({ extra: ["/iletisim"], exclude: ["/gizli"] })();
    const pages = entries.filter((e) => !e.url.includes("/news/") && !e.url.includes("/personel/"));

    expect(pages.map((e) => e.url)).toEqual([
      "https://site.test",
      "https://site.test/en",
      "https://site.test/hakkinda",
      "https://site.test/iletisim",
      "https://site.test/en/iletisim",
    ]);
    expect(pages[0].alternates.languages).toEqual({
      tr: "https://site.test", en: "https://site.test/en", "x-default": "https://site.test",
    });
    // Hidden in English, so the Turkish entry stands alone.
    expect(pages[2].alternates).toBeUndefined();
  });

  it("lists records at their own address, dated, with translations that are listed too", async () => {
    const { CmsPage } = await factory();
    const entries = await CmsPage.sitemap()();
    const news = entries.filter((e) => e.url.includes("/news/"));

    expect(news).toEqual([
      {
        url: "https://site.test/news/yeni-urun",
        lastModified: "2026-10-01T10:00:00Z",
        alternates: {
          languages: {
            tr: "https://site.test/news/yeni-urun",
            en: "https://site.test/en/news/new-product",
            "x-default": "https://site.test/news/yeni-urun",
          },
        },
        images: ["https://cdn.test/c.png"],
      },
      {
        url: "https://site.test/en/news/new-product",
        lastModified: "2026-10-03T10:00:00Z",
        alternates: {
          languages: {
            en: "https://site.test/en/news/new-product",
            tr: "https://site.test/news/yeni-urun",
            "x-default": "https://site.test/news/yeni-urun",
          },
        },
      },
      // The English half of a hidden record is listed, but points at no hidden twin.
      { url: "https://site.test/en/news/hidden-news", lastModified: "2026-10-04T10:00:00Z" },
    ]);
  });

  it("lists a collection with no languages once, under the default language", async () => {
    const { CmsPage } = await factory();
    const entries = await CmsPage.sitemap()();
    expect(entries.filter((e) => e.url.includes("/personel/"))).toEqual([
      { url: "https://site.test/personel/ali", lastModified: "2026-09-01T10:00:00Z" },
    ]);
  });

  it("needs the site's address", async () => {
    const { CmsPage } = await factory({ siteUrl: null });
    expect(() => CmsPage.sitemap()).toThrow(/siteUrl/);
  });

  it("fails rather than listing nothing when the backend does", async () => {
    const { CmsPage } = await factory({ failing: true });
    await expect(CmsPage.sitemap()()).rejects.toThrow("backend down");
  });
});
