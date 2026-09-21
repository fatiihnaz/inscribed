// @vitest-environment jsdom
/**
 * The site arrives with the page, so a navigation is answered by the store: no
 * fetch, no refresh, no frame of placeholders. These pin that down for the
 * visitor, and for the editor, whose drafts are read once for the whole site
 * rather than once per route.
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

/** @param {string} value */
const block = (value, blockPath = "hero.title") => ({
  blockPath,
  blockType: "ShortText",
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
});

const SITE = {
  pages: [
    { slug: "/", blocks: [block("Ana sayfa")] },
    { slug: "/about", blocks: [block("Hakkında")] },
    { slug: "/news/[id]", blocks: [block("Haber")] },
  ],
  global: [{ slug: "__global", blocks: [block("© 2026", "footer.copyright")] }],
};

/** The same site as the editor sees it: every block carrying a draft. */
const withDrafts = (site) => ({
  pages: site.pages.map((p) => ({
    ...p,
    blocks: p.blocks.map((b) => ({ ...b, draftValue: `${b.value} (taslak)` })),
  })),
  global: site.global,
});

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
    if (url.pathname.endsWith("/cms/content/all")) {
      return new Response(JSON.stringify(withDrafts(SITE)));
    }
    // The per-slug fallback, for the transport that answers no whole-site read.
    const slug = url.searchParams.get("slug") ?? "/";
    return new Response(JSON.stringify({
      slug,
      blocks: [{ ...block(`${slug} (editör)`), draftValue: "taslak" }],
    }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A fresh element each time: React bails out of an identical one. */
const tree = (props = {}, children = null) => (
  <CmsProvider config={{ baseUrl: BASE }} initialSite={SITE} {...props}>
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
const urlsOf = (calls) => calls.map((c) => String(c[0]));

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

  it("keeps the globals on a route the site has nothing else for", () => {
    // A page that declares no regions owns no rows, so the site has no entry
    // for it. Nothing of another page's may show there, but the header and
    // footer are nobody's page: they are the same on every one.
    nav.pathname = "/unsynced";
    const { container } = render(tree());
    expect(container.textContent).toBe("© 2026");
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
  it("is the editor's drafts, once for the whole site", async () => {
    const { container, rerender } = render(tree({ isAdmin: true }));
    // The site's published copy paints first; the editor's read lands drafts.
    await waitFor(() => expect(container.textContent).toContain("taslak"));
    expect(contentFetches()).toHaveLength(1);

    nav.pathname = "/about";
    rerender(tree({ isAdmin: true }));
    await waitFor(() => expect(container.textContent).toContain("Hakkında (taslak)"));

    nav.pathname = "/news/7";
    rerender(tree({ isAdmin: true }));
    await new Promise((r) => setTimeout(r, 25));

    // Navigating cost nothing: the read was keyed on the language, not the route.
    expect(contentFetches()).toHaveLength(1);
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
    await waitFor(() => expect(contentFetches()).toHaveLength(1));
    expect(String(contentFetches()[0][0])).toContain("/cms/content/all");
  });

  it("falls back to the route's own slug when the backend has no whole-site read", async () => {
    // And to the template, not the path: `/news/7` has no rows of its own.
    nav.pathname = "/news/7";
    const transport = {
      getContent: vi.fn(async (slug) => ({ slug, blocks: [block(`${slug} (editör)`)] })),
      getMyCollections: async () => [],
    };
    render(tree({ isAdmin: true, transport }));
    await waitFor(() => expect(transport.getContent.mock.calls.length).toBeGreaterThan(0));

    const slugs = transport.getContent.mock.calls.map(([slug]) => slug);
    expect(slugs).toContain("/news/[id]");
    expect(slugs).not.toContain("/news/7");
  });

  it("reads page by page whenever `slugs` is configured, on the REST transport too", async () => {
    // The server decides the same way, so a backend without the whole-site
    // read behaves the same for a visitor's render and an editor's session.
    // Deciding it off the transport's shape instead would send the editor to
    // `/cms/content/all` and leave them with the 404.
    global.fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/cms/collections/me")) return new Response("[]");
      if (url.pathname.endsWith("/cms/content/all")) return new Response("{}", { status: 404 });
      const slug = url.searchParams.get("slug") ?? "/";
      return new Response(JSON.stringify({ slug, blocks: [{ ...block(`${slug} (editör)`), draftValue: "taslak" }] }));
    });
    const config = createCmsConfig({ baseUrl: BASE, slugs: ["/", "/about"] });
    const { container } = render(tree({ isAdmin: true, config }));
    await waitFor(() => expect(container.textContent).toContain("taslak"));
    expect(fetchedSlugs()).toEqual(["/", "__global"]);
    expect(urlsOf(contentFetches()).some((u) => u.includes("/cms/content/all"))).toBe(false);
  });
});

describe("a new site from the server", () => {
  it("replaces every route's blocks", () => {
    const { container, rerender } = render(tree());
    expect(container.textContent).toBe("Ana sayfa© 2026");

    const republished = {
      pages: [{ slug: "/", blocks: [block("Yeni ana sayfa")] }],
      global: [{ slug: "__global", blocks: [block("© 2027", "footer.copyright")] }],
    };
    rerender(tree({ initialSite: republished }));
    expect(container.textContent).toBe("Yeni ana sayfa© 2027");
  });
});
