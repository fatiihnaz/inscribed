// @vitest-environment jsdom
/**
 * A navigation must trigger exactly one content refetch, and which one is
 * decided by privilege: the SSR fetch is ISR-cached under a single tag for
 * every visitor, so it can never carry an editor's `draftValue`. An admin
 * therefore relies on the client refetch and must not also pay for
 * `router.refresh()`; a public visitor has no client fetch and needs the
 * refresh, unless the navigation already delivered fresh blocks.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

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
import { createCmsConfig } from "../../shared/config.js";

const BASE = "https://api.test";

/** @param {string} blockPath */
const block = (blockPath) => ({
  blockPath,
  blockType: "ShortText",
  value: "",
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

let refresh;

beforeEach(() => {
  nav.pathname = "/";
  refresh = vi.fn();
  nav.refresh = refresh;
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return new Response(JSON.stringify([]));
    return new Response(JSON.stringify({ slug: nav.pathname, blocks: [] }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Renders, navigates to `/next`, and optionally hands down new server blocks. */
async function navigate({ isAdmin, freshBlocks }) {
  const initial = [block("hero.title")];
  const { rerender } = render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin={isAdmin} initialBlocks={initial}>
      <div />
    </CmsProvider>,
  );
  // Mount alone must not refresh; only a route change may.
  expect(refresh).not.toHaveBeenCalled();

  nav.pathname = "/next";
  rerender(
    <CmsProvider
      config={{ baseUrl: BASE }}
      isAdmin={isAdmin}
      initialBlocks={freshBlocks ? [block("about.title")] : initial}
    >
      <div />
    </CmsProvider>,
  );
}

describe("one refetch per navigation", () => {
  it("skips router.refresh() for an admin, who refetches on the client", async () => {
    await navigate({ isAdmin: true, freshBlocks: false });
    await waitFor(() =>
      expect(global.fetch.mock.calls.some((c) => String(c[0]).includes("/cms/content"))).toBe(true),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes for a public visitor whose blocks did not travel with the route", async () => {
    await navigate({ isAdmin: false, freshBlocks: false });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("skips the refresh when the navigation already delivered fresh blocks", async () => {
    await navigate({ isAdmin: false, freshBlocks: true });
    await new Promise((r) => setTimeout(r, 25));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders a revisited route from cache with no blank frame", async () => {
    // A root-layout `<CmsPage>`: `initialBlocks` never updates on a soft
    // navigation, so the store is the only thing that can answer for the new
    // route. Blocks are keyed by slug precisely so the answer is already there.
    const home = [{ ...block("hero.title"), value: "Ana sayfa" }];
    // A fresh element each time: React bails out of an identical one, which
    // would skip the very re-render under test.
    const tree = () => (
      <CmsProvider config={{ baseUrl: BASE }} initialBlocks={home}>
        <EditableRegion blockPath="hero.title" />
      </CmsProvider>
    );
    const { rerender, container } = render(tree());
    expect(container.textContent).toBe("Ana sayfa");

    // Away: the other route has nothing cached, so the region reads empty.
    nav.pathname = "/other";
    rerender(tree());
    expect(container.textContent).toBe("");

    // Back: rendered from cache on the first pass, not after a fetch settles.
    nav.pathname = "/";
    rerender(tree());
    expect(container.textContent).toBe("Ana sayfa");
  });
});

/**
 * `<CmsPage slug="/news/[id]">` pins a slug the pathname cannot produce: the
 * URL is `/news/1`, the backend only knows `/news/[id]`. The client used to
 * re-derive it and fetch `/news/1`, which the backend answers 200 with no
 * blocks, and that empty answer was committed over the real ones. `initialRoute`
 * carries the server's slug across so the client addresses the same thing.
 */
describe("a route whose slug is pinned", () => {
  const CONFIG = createCmsConfig({ baseUrl: BASE });

  const renderPinned = (initialRoute) => render(
    <CmsProvider
      config={CONFIG}
      isAdmin
      initialBlocks={[{ ...block("hero.title"), value: "Haber", _slug: "/news/[id]" }]}
      initialRoute={initialRoute}
    >
      <EditableRegion blockPath="hero.title" />
    </CmsProvider>,
  );

  const contentSlugsFetched = () => global.fetch.mock.calls
    .map((c) => new URL(String(c[0])))
    .filter((u) => u.pathname.endsWith("/cms/content"))
    .map((u) => u.searchParams.get("slug"));

  it("refetches the slug the server read, not the one in the URL", async () => {
    nav.pathname = "/news/1";
    renderPinned({ slug: "/news/[id]", locale: null });

    await waitFor(() => expect(contentSlugsFetched().length).toBeGreaterThan(0));
    expect(contentSlugsFetched()).toContain("/news/[id]");
    expect(contentSlugsFetched()).not.toContain("/news/1");
  });

  it("falls back to the URL slug when the server sent no route", async () => {
    // A hand-mounted `<CmsProvider>` without `initialRoute`: deriving is all
    // there is, and it is what this has always done.
    nav.pathname = "/news/1";
    renderPinned(undefined);

    await waitFor(() => expect(contentSlugsFetched().length).toBeGreaterThan(0));
    expect(contentSlugsFetched()).toContain("/news/1");
  });
});

/**
 * A locale switch is the one navigation where the cached answer is not just
 * absent but *wrong*: `carryLocaleSwitch` fills the new route with the previous
 * language's blocks so the switch doesn't flash placeholders. That carry writes
 * into the same map the refresh decision reads, so for a while it talked the
 * refresh out of happening and a public visitor kept reading the old language
 * for the rest of the session. Only `<ContentLoader>` corrected it, and that is
 * admin-only, which is why every hand-test missed it.
 *
 * These run with `locales` configured; the suite above does not, so its routes
 * all resolve to a null locale and never reach the carry at all.
 */
describe("switching locale", () => {
  const CONFIG = createCmsConfig({ baseUrl: BASE, locales: ["tr", "en"] });

  /** Same `initialBlocks` reference throughout: a root-layout `<CmsPage>` is
   *  not re-rendered by a soft navigation, so its props never move. */
  const switchLocale = (blocks, isAdmin = false) => {
    const tree = () => (
      <CmsProvider config={CONFIG} isAdmin={isAdmin} initialBlocks={blocks}>
        <EditableRegion blockPath="hero.title" />
      </CmsProvider>
    );
    const utils = render(tree());
    nav.pathname = "/en";
    utils.rerender(tree());
    return utils;
  };

  it("refreshes a public visitor, whose carried blocks are the wrong language", async () => {
    nav.pathname = "/tr";
    switchLocale([{ ...block("hero.title"), value: "Merhaba" }]);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("still carries the old text meanwhile, rather than flashing a placeholder", () => {
    nav.pathname = "/tr";
    const { container } = switchLocale([{ ...block("hero.title"), value: "Merhaba" }]);
    // Wrong language, but only until the refresh above lands. The carry is the
    // reason the switch doesn't blink, and it stays.
    expect(container.textContent).toBe("Merhaba");
  });

  it("leaves the admin's refresh alone, since the client refetch answers for them", async () => {
    nav.pathname = "/tr";
    switchLocale([{ ...block("hero.title"), value: "Merhaba" }], true);
    await waitFor(() =>
      expect(global.fetch.mock.calls.some((c) => String(c[0]).includes("/cms/content"))).toBe(true),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh a language already visited, which is cached for real", async () => {
    const blocks = [{ ...block("hero.title"), value: "Merhaba" }];
    const tree = () => (
      <CmsProvider config={CONFIG} initialBlocks={blocks}>
        <EditableRegion blockPath="hero.title" />
      </CmsProvider>
    );
    nav.pathname = "/tr";
    const { rerender } = render(tree());

    nav.pathname = "/en";
    rerender(tree());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // Back to Turkish: that entry was seeded by the server, not carried, so it
    // is a real answer and must not cost a second round-trip.
    nav.pathname = "/tr";
    rerender(tree());
    await new Promise((r) => setTimeout(r, 25));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
