// @vitest-environment jsdom
/**
 * What a 409 does to client state, end to end.
 *
 * Two separate paths land here. A publish conflict has to flag the named blocks
 * and refetch without throwing the user's text away, so the cards can offer the
 * choice. A draft-autosave conflict has to re-base and send again, because the
 * person who hit it is still typing and dropping the write would stop saving
 * them silently.
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
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useCmsSave } from "../../core/hooks/use-cms-save.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { CmsApiError } from "../../shared/contracts/errors.js";

const PATH = "hero.title";
const THEIRS = "Onların başlığı";
const MINE = "Benim başlığım";

const block = (over = {}) => ({
  blockPath: PATH,
  blockType: "ShortText",
  value: "ilk",
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
  ...over,
});

/** Blocks the next getContent hands back. */
let served;
let calls;
/** Queue of outcomes for the next writes, so a test can 409 once then succeed. */
let contentOutcomes;
let draftOutcomes;

const probe = /** @type {*} */ ({});

function Probe() {
  const c = useCmsContext();
  const save = useCmsSave();
  probe.setDraft = c.setDraft;
  probe.clearBlockConflict = c.clearBlockConflict;
  probe.save = save.save;
  probe.error = save.error;
  probe.conflicts = useStoreSelector(c.uiStore, (s) => s.conflictBlocks);
  probe.draft = useStoreSelector(c.contentDraftsStore, (m) => m.get(PATH));
  probe.block = useStoreSelector(c.blocksStore, (s) => s.get("/")?.get(PATH));
  return null;
}

const conflictError = (conflicts) =>
  new CmsApiError({ status: 409, detail: "version mismatch", conflicts });

async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  served = [block()];
  calls = [];
  contentOutcomes = [];
  draftOutcomes = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const transport = {
  getContent: async () => {
    calls.push("getContent");
    return { slug: "/", blocks: served };
  },
  getMyCollections: async () => [],
  updateContent: async () => {
    calls.push("updateContent");
    const outcome = contentOutcomes.shift();
    if (outcome) throw outcome;
    return { updated: 1, unchanged: 0 };
  },
  updateDraft: async (request) => {
    calls.push(`updateDraft:${request.blocks[0].version}`);
    const outcome = draftOutcomes.shift();
    if (outcome) throw outcome;
  },
  deleteDraft: async () => { calls.push("deleteDraft"); },
};

async function mount() {
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[block()]}
      >
        <Probe />
      </CmsProvider>,
    );
  });
  await settle();
}

describe("a publish refused with conflicts", () => {
  it("flags the named blocks and keeps the user's text", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    contentOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    // The refetch behind the 409 brings the other editor's published value.
    served = [block({ value: THEIRS, version: 4 })];

    await act(async () => { await probe.save(); });
    await settle();

    expect(probe.conflicts.has(PATH)).toBe(true);
    // Both candidates are now readable: theirs on the block, mine in the draft.
    expect(probe.block.value).toBe(THEIRS);
    expect(probe.draft).toBe(MINE);
  });

  it("flags nothing when the 409 carries no block-level expectation", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    contentOutcomes.push(conflictError(undefined));
    await act(async () => { await probe.save(); });
    await settle();

    expect(probe.conflicts.size).toBe(0);
    expect(probe.draft).toBe(MINE);
  });

  it("drops the failure once resolving the conflict leaves nothing to save", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    contentOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    served = [block({ value: THEIRS, version: 4 })];
    await act(async () => { await probe.save(); });
    await settle();
    expect(probe.error).toBeTruthy();

    // "Take theirs": the draft becomes the published value, so nothing is
    // pending and the banner has nothing left to report.
    act(() => { probe.setDraft(PATH, THEIRS); });
    act(() => { probe.clearBlockConflict(PATH); });
    await settle();

    expect(probe.error).toBe(null);
  });

  it("keeps the failure while the user's own text is still pending", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    contentOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    served = [block({ value: THEIRS, version: 4 })];
    await act(async () => { await probe.save(); });
    await settle();

    // "Keep mine": still dirty, so the save that failed is still relevant.
    act(() => { probe.clearBlockConflict(PATH); });
    await settle();

    expect(probe.error).toBeTruthy();
  });

  it("clears the flags once a later save goes through", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    contentOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    served = [block({ value: THEIRS, version: 4 })];
    await act(async () => { await probe.save(); });
    await settle();
    expect(probe.conflicts.has(PATH)).toBe(true);

    await act(async () => { await probe.save(); });
    await settle();
    expect(probe.conflicts.size).toBe(0);
  });
});

describe("a draft autosave refused with a conflict", () => {
  it("re-bases on the refetch and sends again at the new version", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    draftOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    served = [block({ value: THEIRS, version: 4 })];

    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    // Refetch landed, the lane re-armed, and the retry rides its debounce.
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();

    expect(calls.filter((c) => c.startsWith("updateDraft"))).toEqual([
      "updateDraft:1",
      "updateDraft:4",
    ]);
    // The user's text was never dropped.
    expect(probe.draft).toBe(MINE);
  });

  it("gives up after one re-base rather than looping the lane", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, MINE); });

    draftOutcomes.push(conflictError([{ path: PATH, expected: 4, provided: 1 }]));
    draftOutcomes.push(conflictError([{ path: PATH, expected: 9, provided: 4 }]));
    served = [block({ value: THEIRS, version: 4 })];

    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    await act(async () => { vi.advanceTimersByTime(5000); });
    await settle();

    expect(calls.filter((c) => c.startsWith("updateDraft"))).toHaveLength(2);
  });
});
