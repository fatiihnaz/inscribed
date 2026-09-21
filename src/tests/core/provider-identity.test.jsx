// @vitest-environment jsdom
/**
 * What a re-render of the layout costs, and what it must not cost.
 *
 * `config` and `initialSite` cross the RSC boundary, so every server render
 * hands the provider brand-new objects saying the same thing: a publish, a
 * `router.refresh()`, any Server Action. Two things used to follow from that,
 * and both were invisible from the outside.
 *
 *   - the config was re-normalized on identity, which swapped the context value
 *     and re-ran every effect keyed on it, so the editor's blocks and the
 *     collections `/me` read went over the wire again on each refresh
 *   - the incoming site is the published one and carries no `draftValue`, so
 *     writing it in flat took an editor's unpublished work off the page
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { EditableRegion } from "../../core/EditableRegion.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";

const BASE = "https://api.test";

/** @param {string} value */
const block = (value, blockPath = "hero.title") => ({
  blockPath, blockType: "ShortText", value, draftValue: null, version: 1, sortOrder: 1,
});

const SITE = {
  pages: [{ slug: "/", blocks: [block("Ana sayfa")] }],
  global: [{ slug: "__global", blocks: [block("© 2026", "footer.copyright")] }],
};

const urls = () => /** @type {*} */ (global.fetch).mock.calls.map((c) => String(c[0]));
const contentFetches = () => urls().filter((u) => u.includes("/cms/content"));
const meFetches = () => urls().filter((u) => u.includes("/cms/collections/me"));

/** What the RSC payload actually delivers: the frozen config, serialized. */
const overTheWire = () => JSON.parse(JSON.stringify(createCmsConfig({ baseUrl: BASE })));

/**
 * Identities, not render counts: re-rendering the host makes fresh child
 * elements, so a child re-renders either way. What matters is whether the
 * provider handed out a new context object, since that is what wakes every
 * consumer that only selected a store slice.
 */
let seenContexts = new Set();
function ContextProbe() {
  seenContexts.add(useCmsContext());
  return null;
}

beforeEach(() => {
  nav.pathname = "/";
  seenContexts = new Set();
  global.fetch = vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/cms/collections/me")) return new Response(JSON.stringify([]));
    // The editor's read: the whole site in one request, drafts included.
    return new Response(JSON.stringify({
      pages: [{ slug: "/", blocks: [{ ...block("Ana sayfa"), draftValue: "taslak" }] }],
      global: SITE.global,
    }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a config that arrives new but unchanged", () => {
  const tree = (config) => (
    <CmsProvider config={config} isAdmin initialSite={SITE} collections={CollectionProvider}>
      <ContextProbe />
      <EditableRegion blockPath="hero.title" />
    </CmsProvider>
  );

  it("settles the provider rather than re-reading the site", async () => {
    expect(Object.isFrozen(overTheWire())).toBe(false);

    const { rerender } = render(tree(overTheWire()));
    // The whole site, once. Not once per route, and not once per refresh.
    await waitFor(() => expect(contentFetches().length).toBe(1));
    await waitFor(() => expect(meFetches().length).toBe(1));

    rerender(tree(overTheWire()));
    await new Promise((r) => setTimeout(r, 30));

    expect(contentFetches().length).toBe(1);
    expect(meFetches().length).toBe(1);
    // One context object across both renders: nothing downstream was woken.
    expect(seenContexts.size).toBe(1);
  });
});

describe("a republished site arriving from the server", () => {
  const config = createCmsConfig({ baseUrl: BASE });
  const tree = (site) => (
    <CmsProvider config={config} isAdmin initialSite={site}>
      <EditableRegion blockPath="hero.title" />
    </CmsProvider>
  );

  it("keeps an editor's unpublished draft, which it says nothing about", async () => {
    const { container, rerender } = render(tree(SITE));
    await waitFor(() => expect(container.textContent).toContain("taslak"));
    const fetches = contentFetches().length;

    // Same site, new objects: what the next RSC payload looks like.
    rerender(tree({
      pages: SITE.pages.map((p) => ({ ...p, blocks: p.blocks.map((b) => ({ ...b })) })),
      global: SITE.global.map((p) => ({ ...p, blocks: p.blocks.map((b) => ({ ...b })) })),
    }));
    await new Promise((r) => setTimeout(r, 30));

    expect(container.textContent).toContain("taslak");
    // And it holds it without going back to the backend for it.
    expect(contentFetches().length).toBe(fetches);
  });

  it("drops a draft whose block was published underneath it", async () => {
    const { container, rerender } = render(tree(SITE));
    await waitFor(() => expect(container.textContent).toContain("taslak"));

    // A publish bumps the version, which is what says the old draft is spent.
    rerender(tree({
      pages: [{ slug: "/", blocks: [{ ...block("Yayınlandı"), version: 2 }] }],
      global: SITE.global,
    }));
    await new Promise((r) => setTimeout(r, 30));

    expect(container.textContent).toContain("Yayınlandı");
    expect(container.textContent).not.toContain("taslak");
  });
});
