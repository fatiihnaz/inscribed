/**
 * `CollectionItem.metadata` for a collection with an `seo` entry in the config:
 * addresses from its `path`, fields from the record, hreflang from translations.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));

const EN_RECORD = {
  id: "row-2",
  collectionKey: "news",
  slug: "new-product",
  locale: "en",
  translations: [{ locale: "tr", slug: "yeni-urun" }],
  data: {
    title: "New product",
    seoDescription: "",
    summary: `<p>${"word ".repeat(60)}</p>`,
    cover: { src: "https://cdn.test/cover.png", alt: "The product" },
    hidden: false,
  },
  version: 3,
  canEdit: false,
};

const SEO = {
  news: {
    path: "/news/[slug]",
    title: "title",
    description: ["seoDescription", "summary"],
    image: "cover",
    noindex: "hidden",
  },
};

/** @param {{ item?: *, args?: *[], parent?: * }} [opts] */
async function metadata({ item = EN_RECORD, args = [], parent } = {}) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");
  const { CollectionItem } = createCmsPage({
    config: { baseUrl: "https://api.test", locales: ["tr", "en"], siteUrl: "https://site.test", seo: SEO },
    transport: { getCollectionItem: async () => item },
    Provider: () => null,
    collections: { CollectionProvider: () => null, CollectionRecord: () => null, CollectionRows: () => null },
  });
  return CollectionItem.metadata("news", ...args)(
    { params: Promise.resolve({ slug: item.slug, locale: item.locale }) },
    parent,
  );
}

describe("CollectionItem.metadata with an seo entry", () => {
  it("builds the addresses from the collection's path and the record's translations", async () => {
    const meta = await metadata();
    expect(meta.alternates).toEqual({
      canonical: "https://site.test/en/news/new-product",
      languages: {
        en: "https://site.test/en/news/new-product",
        tr: "https://site.test/news/yeni-urun",
        "x-default": "https://site.test/news/yeni-urun",
      },
    });
  });

  it("fills the metadata from the mapped fields, the first with a value winning", async () => {
    const meta = await metadata();
    expect(meta.title).toBe("New product");
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description.startsWith("word word")).toBe(true);
    expect(meta.description.endsWith("…")).toBe(true);
    expect(meta.openGraph.images).toEqual([{ url: "https://cdn.test/cover.png", alt: "The product" }]);
    expect(meta.robots).toBeUndefined();
  });

  it("keeps a record its Bool field hides out of search", async () => {
    const meta = await metadata({ item: { ...EN_RECORD, data: { ...EN_RECORD.data, hidden: true } } });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("lets the caller's map win over the mapped fields", async () => {
    const meta = await metadata({ args: [(record) => ({ title: `${record.data.title}!` })] });
    expect(meta.title).toBe("New product!");
    expect(meta.alternates.canonical).toBe("https://site.test/en/news/new-product");
  });

  it("names no other language for a record that has none", async () => {
    const meta = await metadata({ item: { ...EN_RECORD, translations: [] } });
    expect(meta.alternates.languages).toBeUndefined();
  });

  it("carries the layout's Open Graph over", async () => {
    const meta = await metadata({
      item: { ...EN_RECORD, data: { ...EN_RECORD.data, cover: null } },
      parent: Promise.resolve({ openGraph: { siteName: "Acme", images: [{ url: "https://cdn.test/home.png" }] } }),
    });
    expect(meta.openGraph.siteName).toBe("Acme");
    expect(meta.openGraph.images).toEqual([{ url: "https://cdn.test/home.png" }]);
  });
});
