// @vitest-environment jsdom
/**
 * The collection half of the "context carries seams, stores carry state" split,
 * mirroring cms-context-split.test.jsx.
 *
 * `CollectionContext` still publishes four React-state slices (bindings, inline
 * field records, the active-item signal, /me), so mounting one
 * `<CollectionItem>` re-renders every collection consumer on the page. Each test
 * drives one of those channels and asserts a page-side consumer stayed put.
 *
 * Two things make these counts mean what they claim:
 *
 * - The consumer element is hoisted (`CONSUMER`). `rerender` from the root
 *   would otherwise hand React a fresh element and re-render it on identity
 *   alone, measuring the parent instead of the context. A stable element lets
 *   React bail out of the subtree, while a context change still propagates
 *   into it, which is exactly the signal under test.
 * - There is a positive control. Every other case asserts "did not re-render",
 *   so an implementation that simply drops these fields from the context would
 *   go green while breaking the drawer. `readBindings` is the one place that
 *   asserts the moved state is still observable, and the one line that has to
 *   change when the registry lands in `collectionStore`.
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
  usePathname: () => "/news",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionItem } from "../../collections/CollectionItem.jsx";
import { useCollectionContext } from "../../collections/context.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch() {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    if (/\/cms\/collections\/news\/[^/?]+/.test(url)) {
      return jsonRes({
        id: "row-1",
        collectionKey: "news",
        slug: "q1",
        data: { title: "Q1" },
        version: 1,
        // Read-only keeps the record off the editor path, which is a separate
        // concern (see collection-editor-driver.test.jsx).
        canEdit: false,
      });
    }
    if (url.includes("/cms/collections/news")) {
      return jsonRes({ items: [], total: 0, offset: 0, limit: 50 });
    }
    return jsonRes({ slug: "/news", blocks: [] });
  });
}

/**
 * Where the binding registry is read from: a store slice, not the context.
 * @param {*} ctx
 */
const readBindings = (ctx) => ctx.collectionStore.get().bindings;

/** Renders of the page-side collection consumer since mount. */
let consumerRenders = 0;

/** Stands in for a `<CollectionField>` / `useCollection` caller. */
function CollectionConsumer() {
  useCollectionContext();
  consumerRenders += 1;
  return null;
}

function Handle({ onReady }) {
  const ctx = useCollectionContext();
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    onReady(() => ref.current);
  }, [onReady]);
  return null;
}

// Hoisted: see the docblock. Both must survive a root-level `rerender`.
const CONSUMER = <CollectionConsumer />;

const record = (slug = "q1") => (
  <CollectionItem collection="news" slug={slug}>
    <span>row</span>
  </CollectionItem>
);

function renderCollections(children, onReady = () => {}) {
  mockFetch();
  const handleEl = <Handle onReady={onReady} />;
  const tree = (kids) => (
    <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
      {CONSUMER}
      {handleEl}
      {kids}
    </CmsProvider>
  );
  const utils = render(tree(children));
  return { ...utils, rerenderWith: (kids) => utils.rerender(tree(kids)) };
}

/** Mount plus the /me round-trip, so later counts measure interaction only. */
async function settled(children = null) {
  let getHandle = () => null;
  const rendered = renderCollections(children, (getter) => { getHandle = getter; });
  const handle = () => getHandle();
  await waitFor(() => expect(handle()).not.toBeNull());
  await waitFor(() => expect(handle().collectionStore.get().meta.isLoading).toBe(false));
  return { ...rendered, handle };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  consumerRenders = 0;
});

describe("collection context seams / store state", () => {
  it("does not re-render collection consumers when a record binds", async () => {
    const { handle, rerenderWith } = await settled(null);

    const before = consumerRenders;
    rerenderWith(record());
    // The binding registers from an effect that runs only after the record
    // fetch resolves, so waiting on "fetch was called" would pass on the
    // mount-time /me request and never observe the bind.
    await waitFor(() =>
      expect(readBindings(handle()).has("collection:news:q1")).toBe(true),
    );

    expect(consumerRenders).toBe(before);
  });

  it("does not re-render collection consumers when a record unbinds", async () => {
    const { handle, rerenderWith } = await settled(record());
    await waitFor(() =>
      expect(readBindings(handle()).has("collection:news:q1")).toBe(true),
    );

    const before = consumerRenders;
    rerenderWith(null);
    await waitFor(() =>
      expect(readBindings(handle()).has("collection:news:q1")).toBe(false),
    );

    expect(consumerRenders).toBe(before);
  });

  it("still publishes a binding to whoever reads the registry", async () => {
    // Positive control: the drawer builds its collection lanes from this, so
    // "nobody re-rendered" is only good news if the entry still lands.
    const { handle, rerenderWith } = await settled(null);
    expect(readBindings(handle()).size).toBe(0);

    rerenderWith(record());
    await waitFor(() => expect(readBindings(handle()).size).toBe(1));

    const binding = readBindings(handle()).get("collection:news:q1");
    expect(binding).toMatchObject({ collection: "news", slug: "q1" });
  });

  it("does not re-render collection consumers when an inline field claims a record", async () => {
    const { handle } = await settled();

    const before = consumerRenders;
    act(() => { handle().registerInlineField("news", "q1", "scope-1"); });
    expect(consumerRenders).toBe(before);

    act(() => { handle().unregisterInlineField("news", "q1", "scope-1"); });
    expect(consumerRenders).toBe(before);
  });

  it("keeps collection consumers out of the drawer's open-this-row signal", async () => {
    const { handle } = await settled();

    const before = consumerRenders;
    // The StatusBar "Aç" jump: set, then the panel clears it once consumed.
    act(() => { handle().setActiveCollectionItem({ key: "news", slug: "q1" }); });
    act(() => { handle().setActiveCollectionItem(null); });

    expect(consumerRenders).toBe(before);
  });

  it("keeps collection consumers out of a /me refetch", async () => {
    const { handle } = await settled();

    const before = consumerRenders;
    act(() => { handle().refetchMyCollections(); });
    await waitFor(() =>
      expect(global.fetch.mock.calls.filter(([u]) =>
        String(u).includes("/cms/collections/me")).length).toBeGreaterThan(1),
    );

    expect(consumerRenders).toBe(before);
  });

  it("keeps one context value for the life of the session", async () => {
    // `getAccessToken` is supplied, so the built-in browser auth never runs and
    // `CmsContext` holds still: everything that moves this value today is the
    // collection provider's own state, which is what Faz 1 removes.
    let first = null;
    const { handle } = await settled();
    first = handle();

    act(() => {
      handle().setActiveCollectionItem({ key: "news", slug: "q1" });
      handle().registerInlineField("news", "q1", "scope-1");
      handle().registerCollectionBinding("collection:news:q2", {
        collection: "news",
        slug: "q2",
      });
    });

    expect(handle()).toBe(first);
  });
});
