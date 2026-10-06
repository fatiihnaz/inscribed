// @vitest-environment jsdom
/**
 * A navigation with nothing to clear writes nothing: every subscriber to the
 * drafts or the conflicts would otherwise re-render on each page change.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { memo } from "react";
import { render, cleanup, act } from "@testing-library/react";

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
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useCollectionContext } from "../../collections/context.js";
import { useStoreSelector } from "../../shared/state/store.js";

let renders = 0;

const Subscriber = memo(function Subscriber() {
  const { contentDraftsStore, uiStore } = useCmsContext();
  const { collectionStore } = useCollectionContext();
  useStoreSelector(contentDraftsStore, (drafts) => drafts);
  useStoreSelector(uiStore, (s) => s.conflictBlocks);
  useStoreSelector(collectionStore, (s) => s.drafts);
  renders += 1;
  return null;
});

const subscriber = <Subscriber />;

// One object each, as a layout that does not re-render on a soft navigation hands over.
const CONFIG = { baseUrl: "https://api.test" };
const TRANSPORT = /** @type {*} */ ({ getSiteContent: async () => SITE, getMyCollections: async () => [] });

const tree = () => (
  <CmsProvider
    collections={CollectionProvider}
    config={CONFIG}
    transport={TRANSPORT}
    isAdmin
    initialSite={SITE}
  >
    {subscriber}
  </CmsProvider>
);

const SITE = { pages: [{ slug: "/", blocks: [] }, { slug: "/about", blocks: [] }], global: [] };

afterEach(() => {
  cleanup();
  nav.pathname = "/";
  renders = 0;
});

describe("a navigation with no drafts", () => {
  it("leaves the drafts and conflicts subscribers alone", async () => {
    let view;
    await act(async () => {
      view = render(tree());
    });
    const before = renders;

    nav.pathname = "/about";
    await act(async () => {
      view.rerender(tree());
    });

    expect(renders).toBe(before);
  });
});
