// @vitest-environment jsdom
/**
 * The site arrives with the page, so a navigation is answered by the store: no
 * fetch, no refresh, no frame of placeholders. These pin that down for the
 * visitor, and the one thing that still fetches, an editor's drafts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/", refresh: () => {} }));

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: nav.refresh, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { EditableRegion } from "../../core/EditableRegion.jsx";
import { useCmsContent } from "../../core/hooks/use-cms-content.js";
import { useCmsRoute } from "../../core/hooks/use-cms-route.js";
import { createCmsConfig } from "../../shared/config.js";

const BASE = "https://api.test";

/** @param {string} value @param {string} slug */
const block = (value, slug, blockPath = "hero.title") => ({
  blockPath,
  blockType: "ShortText",
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
});

const SITE = [
  { slug: "/", blocks: [block("Ana sayfa", "/")] },
  { slug: "/about", blocks: [block("Hakkında", "/about")] },
  { slug: "/news/[id]", blocks: [block("Haber", "/news/[id]")] },
  { slug: "__global", blocks: [block("© 2026", "__global", "footer.copyright")] },
];

let refresh;

const contentFetches = () =>
  global.fetch.mock.calls.filter((c) => String(c[0]).includes("/cms/content"));

beforeEach(() => {
  nav.pathname = "/";
  refresh = vi.fn();
  nav.refresh = refresh;
  global.fetch = vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/cms/collections/me")) return new Response(JSON.stringify([]));
    const slug = url.searchParams.get("slug") ?? "/";
    return new Response(JSON.stringify({
      slug,
      blocks: [{ ...block(`${slug} (editör)`, slug), draftValue: "taslak" }],
    }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A fresh element each time: React bails out of an identical one. */
const tree = (props = {}, children = null) => (
  <CmsProvider config={{ baseUrl: BASE }} initialPages={SITE} {...props}>
    {children ?? (
      <>
        <EditableRegion blockPath="hero.title" />
        <EditableRegion blockPath="footer.copyright" as="footer" />
      </>
    )}
  </CmsProvider>
);

const fetchedSlugs = () =>
  contentFetches().map((c) => new URL(String(c[0])).searchParams.get("slug"));

describe("a visitor's navigation", () => {
  it("renders every route from the site the page arrived with", () => {
    const { container, rerender } = render(tree());
    expect(container.textContent).toBe("Ana sayfa© 2026");

    nav.pathname = "/about";
    rerender(tree());
    expect(container.textContent).toBe("Hakkında© 2026");

    nav.pathname = "/";
    rerender(tree());
    expect(container.textContent).toBe("Ana sayfa© 2026");
  });

  it("costs no request and no refresh", async () => {
    const { rerender } = render(tree());
    nav.pathname = "/about";
    rerender(tree());
    nav.pathname = "/news/7";
    rerender(tree());

    await new Promise((r) => setTimeout(r, 25));
    expect(contentFetches()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads a dynamic route's template without the page saying so", () => {
    nav.pathname = "/news/7";
    const { container } = render(tree());
    expect(container.textContent).toBe("Haber© 2026");
  });

  it("paints empty, not stale, on a route the site has nothing for", () => {
    // A page that declares no regions owns no rows, so the site has no entry
    // for it and nothing of another page's may show there.
    nav.pathname = "/unsynced";
    const { container } = render(tree());
    expect(container.textContent).toBe("");
  });
});

describe("the route as the hooks see it", () => {
  function Probe() {
    const { slug, locale } = useCmsRoute();
    return <span>{`${slug}|${locale}`}</span>;
  }

  it("matches the slug the backend stores, in the site's language", () => {
    const config = createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] });
    nav.pathname = "/en/news/42";
    const { container } = render(tree({ config }, <Probe />));
    expect(container.textContent).toBe("/news/[id]|en");
  });

  it("keeps a concrete path that matches nothing as its own slug", () => {
    nav.pathname = "/team/ali";
    const { container } = render(tree({}, <Probe />));
    expect(container.textContent).toBe("/team/ali|null");
  });
});

describe("what still fetches", () => {
  function Loader() {
    useCmsContent();
    return null;
  }

  it("is the editor's drafts, once per route", async () => {
    const { container, rerender } = render(tree({ isAdmin: true }));
    await waitFor(() => expect(contentFetches().length).toBeGreaterThan(0));
    // The site's copy paints first; the editor's own fetch then lands drafts.
    await waitFor(() => expect(container.textContent).toContain("taslak"));

    expect(fetchedSlugs()).not.toContain("/about");
    nav.pathname = "/about";
    rerender(tree({ isAdmin: true }));
    await waitFor(() => expect(fetchedSlugs()).toContain("/about"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is nothing for a visitor calling useCmsContent, until they ask", async () => {
    let refetch;
    function Reader() {
      const content = useCmsContent();
      refetch = content.refetch;
      return <span>{content.blocks.map((b) => b.value).join(",")}</span>;
    }
    const { container } = render(tree({}, <Reader />));
    expect(container.textContent).toBe("Ana sayfa,© 2026");
    await new Promise((r) => setTimeout(r, 25));
    expect(contentFetches()).toEqual([]);

    act(() => refetch());
    // The page and its global slug, one request each.
    await waitFor(() => expect(fetchedSlugs()).toEqual(["/", "__global"]));
  });

  it("fetches the template slug for a dynamic route", async () => {
    nav.pathname = "/news/7";
    render(tree({ isAdmin: true }, <Loader />));
    await waitFor(() => expect(contentFetches().length).toBeGreaterThan(0));
    expect(fetchedSlugs()).toContain("/news/[id]");
    expect(fetchedSlugs()).not.toContain("/news/7");
  });
});

describe("a new site from the server", () => {
  it("replaces every route's blocks", () => {
    const { container, rerender } = render(tree());
    expect(container.textContent).toBe("Ana sayfa© 2026");

    const republished = [
      { slug: "/", blocks: [block("Yeni ana sayfa", "/")] },
      { slug: "__global", blocks: [block("© 2027", "__global", "footer.copyright")] },
    ];
    rerender(tree({ initialPages: republished }));
    expect(container.textContent).toBe("Yeni ana sayfa© 2027");
  });
});
