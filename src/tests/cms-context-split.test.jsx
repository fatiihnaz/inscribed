// @vitest-environment jsdom
/**
 * Guards the "context carries seams, stores carry state" split. The context
 * value must stay identity-stable for the life of the session, so a component
 * re-renders only when a store slice it selected moved.
 *
 * Each test drives one channel that used to sit in a React state field (the
 * panel toggle, the schema registry, a draft write, a block update) and asserts
 * a page-side consumer stayed put. These are render *counts*: they fail loudly
 * if any of that state migrates back into the context value.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { useEffect, useRef } from "react";
import { render, cleanup, act, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../components/CmsProvider.jsx";
import { useCmsContext } from "../lib/context.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch() {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    return jsonRes({ slug: "/", blocks: [] });
  });
}

/** Renders of the page-side consumer since mount. */
let pageRenders = 0;

/** Stands in for an `<EditableRegion>`: reads the context, selects nothing. */
function PageConsumer() {
  useCmsContext();
  pageRenders += 1;
  return null;
}

/** Hands the context out to the test body. */
function Handle({ onReady }) {
  const ctx = useCmsContext();
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    onReady(() => ref.current);
  }, [onReady]);
  return null;
}

function renderCms(children) {
  let getHandle = () => null;
  const utils = render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin>
      <PageConsumer />
      <Handle onReady={(getter) => { getHandle = getter; }} />
      {children}
    </CmsProvider>,
  );
  return { ...utils, handle: () => getHandle() };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pageRenders = 0;
});

describe("context seams / store state", () => {
  it("does not re-render the page tree when the drawer opens", async () => {
    mockFetch();
    const { handle } = renderCms(null);
    await waitFor(() => expect(handle()).not.toBeNull());

    const before = pageRenders;
    act(() => { handle().setDrawerOpen(true); });

    expect(handle().uiStore.get().isDrawerOpen).toBe(true);
    expect(pageRenders).toBe(before);
  });

  it("does not re-render the page tree when a list registers its schema", async () => {
    mockFetch();
    const schema = { fields: [{ key: "title", label: "Başlık", type: "ShortText" }] };

    // Registers from an effect, the way `<EditableList>` does. As React state
    // this bumped the shared value and took the page with it.
    function LateList() {
      const { registerItemSchema, unregisterItemSchema } = useCmsContext();
      useEffect(() => {
        registerItemSchema("team.members", schema);
        return () => unregisterItemSchema("team.members");
      }, [registerItemSchema, unregisterItemSchema]);
      return null;
    }

    const { handle } = renderCms(<LateList />);
    await waitFor(() =>
      expect(handle()?.registryStore.get().itemSchemas.get("team.members")).toBe(schema),
    );

    const afterRegistration = pageRenders;
    act(() => { handle().setDrawerOpen(true); });
    expect(pageRenders).toBe(afterRegistration);
  });

  it("keeps the page out of a draft write and the autosave status pulse", async () => {
    mockFetch();
    const { handle } = renderCms(null);
    await waitFor(() => expect(handle()).not.toBeNull());

    const before = pageRenders;
    act(() => { handle().setDraft("hero.title", "yeni"); });
    expect(pageRenders).toBe(before);
  });

  it("keeps an unrelated consumer out of a single block's update", async () => {
    mockFetch();
    const { handle } = renderCms(null);
    await waitFor(() => expect(handle()).not.toBeNull());

    const before = pageRenders;
    // What an autosave roundtrip does: rewrite the map with one block changed.
    act(() => {
      handle().setBlocks(() => new Map([
        ["hero.title", {
          blockPath: "hero.title",
          blockType: "ShortText",
          value: "",
          draftValue: "taslak",
          version: 1,
          sortOrder: 1,
        }],
      ]));
    });

    expect(handle().blocksStore.get().size).toBe(1);
    expect(pageRenders).toBe(before);
  });

  it("keeps one context value for the life of the session", async () => {
    mockFetch();
    const { handle } = renderCms(null);
    await waitFor(() => expect(handle()).not.toBeNull());

    const first = handle();
    act(() => {
      handle().setDrawerOpen(true);
      handle().setActiveBlock("hero.title");
      handle().setDraft("hero.title", "x");
      handle().triggerRefetch();
    });
    expect(handle()).toBe(first);
  });
});
