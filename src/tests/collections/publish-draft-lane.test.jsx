// @vitest-environment jsdom
/**
 * The collection-side twin of `tests/core/publish-draft-lane.test.jsx`.
 *
 * `useCollectionEditor.save()` used to leave the record's draft lane running, so
 * an autosave already on the wire both patched `draftData` back onto the
 * freshly-published row and re-created the backend slot the publish had cleared.
 * `undoDraft` had the right shape already (cancel, then enqueue the DELETE
 * behind whatever is in flight); publish now uses it too.
 *
 * As in the content test, the draft write applies when the test lands it, which
 * is how the late arrival is modelled.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/haberler",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { useCollectionEditor } from "../../collections/hooks/use-collection-editor.js";

const COLLECTION = "news";
const SLUG = "q1";
const PUBLISHED = "Q1 raporu";
const TYPED = "Yeni başlık";

const field = (name, label, type) => ({
  name, label, type, required: false, readOnly: false,
  options: null, fields: null, help: null,
});
const SCHEMA = { fields: [field("title", "Başlık", "ShortText")] };

let server;
let calls;
let draftPuts;
let upserts;

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve: /** @type {*} */ (resolve) };
}

const probe = /** @type {{ editor: * }} */ ({});

function Harness() {
  probe.editor = useCollectionEditor(COLLECTION, SLUG);
  return null;
}

async function tick(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  server = { data: { title: PUBLISHED }, draftData: null, version: 3 };
  calls = [];
  draftPuts = [];
  upserts = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const row = () => ({
  id: "row-1",
  collectionKey: COLLECTION,
  slug: SLUG,
  data: server.data,
  draftData: server.draftData,
  version: server.version,
  canEdit: true,
});

const transport = {
  getContent: async () => ({ slug: "/haberler", blocks: [] }),
  getMyCollections: async () => [{
    collectionKey: COLLECTION,
    canCreate: false,
    slugSource: "UserDefined",
    schema: SCHEMA,
  }],
  getCollectionItem: async () => row(),
  getCollection: async () => ({ items: [row()], total: 1, offset: 0, limit: 50 }),
  saveCollectionItemDraft: (key, slug, payload) => {
    calls.push("saveCollectionItemDraft");
    const d = deferred();
    draftPuts.push({
      land: () => {
        server = { ...server, draftData: payload.data };
        d.resolve(undefined);
      },
    });
    return d.promise;
  },
  upsertCollectionItem: (key, slug, payload) => {
    calls.push("upsertCollectionItem");
    const d = deferred();
    upserts.push({
      land: () => {
        server = { data: payload.data, draftData: null, version: server.version + 1 };
        d.resolve(row());
      },
    });
    return d.promise;
  },
  deleteCollectionItemDraft: async () => {
    calls.push("deleteCollectionItemDraft");
    server = { ...server, draftData: null };
  },
};

async function mount() {
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
      >
        <Harness />
      </CmsProvider>,
    );
  });
  await settle();
}

describe("collection publish vs. an in-flight draft autosave", () => {
  it("orders the cleanup behind the draft write it raced, leaving no stale draft", async () => {
    await mount();
    expect(probe.editor.schema).toBeTruthy();
    expect(probe.editor.canEdit).toBe(true);

    act(() => { probe.editor.setValues({ title: TYPED }); });
    await tick();
    expect(draftPuts).toHaveLength(1);

    act(() => { probe.editor.save(); });
    await settle();
    expect(upserts).toHaveLength(1);

    await act(async () => { upserts[0].land(); });
    // Enqueued, not sent: the lane still holds the unfinished draft write.
    expect(calls).not.toContain("deleteCollectionItemDraft");

    await act(async () => { draftPuts[0].land(); });
    await settle();

    expect(calls).toEqual([
      "saveCollectionItemDraft",
      "upsertCollectionItem",
      "deleteCollectionItemDraft",
    ]);
    expect(server.data).toEqual({ title: TYPED });
    expect(server.draftData).toBe(null);
  });

  it("does not let the raced write patch draftData back onto the published row", async () => {
    await mount();

    act(() => { probe.editor.setValues({ title: TYPED }); });
    await tick();
    act(() => { probe.editor.save(); });
    await settle();
    await act(async () => { upserts[0].land(); });
    await act(async () => { draftPuts[0].land(); });
    await settle();

    // `hasDraft` drives the row's dirty badge; the mirror would light it back up
    // moments after the user published.
    expect(probe.editor.hasDraft).toBe(false);
  });
});
