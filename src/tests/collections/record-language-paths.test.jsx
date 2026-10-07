// @vitest-environment jsdom
/**
 * A record's other languages: their addresses reach the language switcher
 * when the collection names its path (`seo.path`), and a slug read in another
 * language is the record's translation, not an old address of it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/news/yeni-urun",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { CollectionRecord } from "../../collections/CollectionItem.jsx";
import { useCmsRoute } from "../../core/hooks/use-cms-route.js";

const ITEM = {
  id: "row-1",
  collectionKey: "news",
  slug: "yeni-urun",
  locale: "tr",
  translations: [{ locale: "en", slug: "new-product" }],
  data: { title: "Yeni ürün" },
  version: 1,
};

function Switch() {
  const { path, localePath } = useCmsRoute();
  return <nav>{localePath(path, "en")}</nav>;
}

/** @param {{ seo?: *, fromRegion?: string }} opts */
function renderPage({ seo, fromRegion } = {}) {
  const config = { baseUrl: "https://api.test", locales: ["tr", "en"], ...(seo ? { seo } : null) };
  return render(
    <CmsProvider collections={CollectionProvider} config={config}>
      <Switch />
      <CollectionRecord collection="news" slug="yeni-urun" item={ITEM} fromRegion={fromRegion}>
        <article />
      </CollectionRecord>
    </CmsProvider>,
  );
}

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify([])));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a record's addresses in other languages", () => {
  it("reach the switcher when the collection names its path", () => {
    const { container } = renderPage({ seo: { news: { path: "/news/[slug]" } } });
    expect(container.querySelector("nav")?.textContent).toBe("/en/news/new-product");
  });

  it("stay out of it without one, where the prefix is all a switch can change", () => {
    const { container } = renderPage();
    expect(container.querySelector("nav")?.textContent).toBe("/en/news/yeni-urun");
  });

  it("stay out of it for a row of a list, which is not the page on screen", () => {
    const { container } = renderPage({ seo: { news: { path: "/news/[slug]" } }, fromRegion: "news:list" });
    expect(container.querySelector("nav")?.textContent).toBe("/en/news/yeni-urun");
  });
});

describe("a record read in the page's language", () => {
  it("is not taken for an old address of the record", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const english = { ...ITEM, slug: "new-product", locale: "en", translations: [{ locale: "tr", slug: "yeni-urun" }] };
    render(
      <CmsProvider collections={CollectionProvider} config={{ baseUrl: "https://api.test", locales: ["tr", "en"] }}>
        <CollectionRecord collection="news" slug="yeni-urun" item={english}><article /></CollectionRecord>
      </CmsProvider>,
    );
    expect(warn.mock.calls.some((call) => String(call[0]).includes("points at an old address"))).toBe(false);
  });

  it("still is when the slug belongs to no translation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renamed = { ...ITEM, slug: "yeni-adres", translations: [] };
    render(
      <CmsProvider collections={CollectionProvider} config={{ baseUrl: "https://api.test", locales: ["tr", "en"] }}>
        <CollectionRecord collection="news" slug="eski-adres" item={renamed}><article /></CollectionRecord>
      </CmsProvider>,
    );
    expect(warn.mock.calls.some((call) => String(call[0]).includes("points at an old address"))).toBe(true);
  });
});
