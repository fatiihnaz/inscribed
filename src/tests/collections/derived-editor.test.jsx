// @vitest-environment jsdom
/**
 * `useCollectionEditor` against a claim-derived slug the user owns but has
 * never saved. The single read answers with a virtual body (`origin`, no `id`
 * and no `version`), and every write still belongs to that slug's own slots.
 *
 * The old code keyed "virtual" off `version === 0` and sent such a row's draft
 * to the collection's slug-less pending slot, which nothing ever read back and
 * which the backend now rejects outright. Same harness as the publish-lane
 * test: a stub transport, fake timers for the autosave debounce.
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
  usePathname: () => "/takimlar",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { useCollectionEditor } from "../../collections/hooks/use-collection-editor.js";

const COLLECTION = "teams";
const SLUG = "web";
const TYPED = "Web ekibi";

const SCHEMA = {
  fields: [{
    name: "name",
    label: "Ad",
    type: "ShortText",
    required: false,
    readOnly: false,
    computed: false,
    filterable: false,
    sortable: false,
    options: null,
    itemFields: null,
    help: null,
  }],
};

let server;
let calls;
let upsertPayloads;

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

/** What the single read answers while the slug has no record behind it. */
const virtualBody = () => ({
  collectionKey: COLLECTION,
  origin: "derived",
  slug: SLUG,
  canEdit: true,
  data: {},
  draftData: server.draftData,
  locale: "tr",
});

const transport = {
  getContent: async () => ({ slug: "/takimlar", blocks: [] }),
  getMyCollections: async () => [{
    collectionKey: COLLECTION,
    canCreate: false,
    slugSource: "ClaimDerived",
    schema: SCHEMA,
  }],
  getCollectionItem: async () => (server.row ?? virtualBody()),
  getCollection: async () => ({
    items: [],
    total: 0,
    offset: 0,
    limit: 50,
    virtualItems: [virtualBody()],
  }),
  saveCollectionItemDraft: async (key, slug, payload) => {
    calls.push(`saveCollectionItemDraft:${slug}`);
    server.draftData = payload.data;
  },
  deleteCollectionItemDraft: async (key, slug) => {
    calls.push(`deleteCollectionItemDraft:${slug}`);
    server.draftData = null;
  },
  saveCollectionNewDraft: async () => {
    calls.push("saveCollectionNewDraft");
  },
  deleteCollectionNewDraft: async () => {
    calls.push("deleteCollectionNewDraft");
  },
  upsertCollectionItem: async (key, slug, payload) => {
    calls.push(`upsertCollectionItem:${slug}`);
    upsertPayloads.push(payload);
    server.row = {
      id: "row-1",
      collectionKey: COLLECTION,
      slug: SLUG,
      data: payload.data,
      draftData: null,
      version: 1,
      canEdit: true,
    };
    server.draftData = null;
    return server.row;
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

beforeEach(() => {
  vi.useFakeTimers();
  server = { draftData: null, row: null };
  calls = [];
  upsertPayloads = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("editing a claim-derived slug with no record yet", () => {
  it("treats the virtual body as editable and virtual", async () => {
    await mount();
    expect(probe.editor.canEdit).toBe(true);
    expect(probe.editor.isVirtual).toBe(true);
  });

  it("autosaves into the slug's own draft slot, not the pending one", async () => {
    await mount();

    act(() => { probe.editor.setValues({ name: TYPED }); });
    await tick();

    expect(calls).toEqual([`saveCollectionItemDraft:${SLUG}`]);
    expect(calls).not.toContain("saveCollectionNewDraft");
    expect(server.draftData).toEqual({ name: TYPED });
  });

  it("publishes without a version and cleans up the slug's draft slot", async () => {
    await mount();

    act(() => { probe.editor.setValues({ name: TYPED }); });
    await tick();
    act(() => { probe.editor.save(); });
    await settle();

    expect(upsertPayloads).toEqual([{ data: { name: TYPED }, version: null }]);
    expect(calls).toContain(`deleteCollectionItemDraft:${SLUG}`);
    expect(calls).not.toContain("deleteCollectionNewDraft");
  });

  it("sends the version once the row is real", async () => {
    await mount();

    act(() => { probe.editor.setValues({ name: TYPED }); });
    await tick();
    act(() => { probe.editor.save(); });
    await settle();

    act(() => { probe.editor.setValues({ name: "Web" }); });
    await tick();
    act(() => { probe.editor.save(); });
    await settle();

    expect(upsertPayloads[1]).toEqual({ data: { name: "Web" }, version: 1 });
  });

  it("discards a derived row's draft on the server, not just locally", async () => {
    await mount();

    act(() => { probe.editor.setValues({ name: TYPED }); });
    await tick();
    await settle();
    expect(probe.editor.hasDraft).toBe(true);

    act(() => { probe.editor.undoDraft(); });
    await settle();

    // Used to early-return on `version === 0`, leaving the slot dirty for the
    // next reader while the badge claimed it was clean.
    expect(calls).toContain(`deleteCollectionItemDraft:${SLUG}`);
    expect(server.draftData).toBe(null);
  });
});
