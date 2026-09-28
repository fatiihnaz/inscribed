// @vitest-environment jsdom
/**
 * An edit typed inside the autosave debounce and then left behind, by a
 * navigation or by the provider unmounting as it does on a language switch.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
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
import { useCmsContext } from "../../shared/state/cms-context.js";

const block = (slug, value) => ({
  blockPath: "hero.title",
  blockType: "ShortText",
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: slug,
});

const SITE = {
  pages: [
    { slug: "/", blocks: [block("/", "Ana sayfa")] },
    { slug: "/about", blocks: [block("/about", "Hakkında")] },
  ],
  global: [],
};

let transport;
const probe = /** @type {{ setDraft: (path: string, value: *) => void }} */ ({});

function Probe() {
  probe.setDraft = useCmsContext().setDraft;
  return null;
}

const tree = () => (
  <CmsProvider
    config={{ baseUrl: "https://api.test" }}
    transport={transport}
    isAdmin
    initialSite={SITE}
  >
    <Probe />
  </CmsProvider>
);

async function mount() {
  let view;
  await act(async () => {
    view = render(tree());
  });
  return /** @type {ReturnType<typeof render>} */ (view);
}

const tick = (ms = 1000) => act(async () => {
  vi.advanceTimersByTime(ms);
});

const writtenValues = () => transport.updateDraft.mock.calls.map(([request]) => ({
  slug: request.slug,
  values: request.blocks.map((b) => b.value),
}));

beforeEach(() => {
  vi.useFakeTimers();
  nav.pathname = "/";
  transport = {
    getSiteContent: async () => SITE,
    getContent: async (slug) => ({ slug, blocks: SITE.pages.find((p) => p.slug === slug)?.blocks ?? [] }),
    getMyCollections: async () => [],
    updateDraft: vi.fn(async () => undefined),
    updateContent: async () => ({ updated: 0, unchanged: 0 }),
    deleteDraft: async () => undefined,
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("an edit left inside the autosave debounce", () => {
  it("is written when the page stays", async () => {
    await mount();
    act(() => probe.setDraft("hero.title", "yazılan"));
    await tick();

    expect(writtenValues()).toEqual([{ slug: "/", values: ["yazılan"] }]);
  });

  it("is written after a navigation to another page", async () => {
    const view = await mount();
    act(() => probe.setDraft("hero.title", "yazılan"));

    nav.pathname = "/about";
    await act(async () => {
      view.rerender(tree());
    });
    await tick();

    expect(writtenValues()).toEqual([{ slug: "/", values: ["yazılan"] }]);
  });

  it("is written after the provider unmounts", async () => {
    const view = await mount();
    act(() => probe.setDraft("hero.title", "yazılan"));

    view.unmount();
    await tick();

    expect(writtenValues()).toEqual([{ slug: "/", values: ["yazılan"] }]);
  });
});
