// @vitest-environment jsdom
/**
 * A slug read in another language is the record's translation, not an old
 * address of it.
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

const ITEM = {
  id: "row-1",
  collectionKey: "news",
  slug: "yeni-urun",
  locale: "tr",
  translations: [{ locale: "en", slug: "new-product" }],
  data: { title: "Yeni ürün" },
  version: 1,
};

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify([])));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
