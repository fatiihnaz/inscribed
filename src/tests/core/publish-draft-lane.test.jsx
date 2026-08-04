// @vitest-environment jsdom
/**
 * Publishing while a draft autosave is on the wire.
 *
 * The two are independent requests, so a draft PUT can reach the backend after
 * the publish cleared the slot and re-create it with what was typed before the
 * save. Cancelling can't recall a sent request, so the fix orders the cleanup
 * instead: `settleDraftWrites` enqueues the DELETE on the same lane, and the
 * queue's chain runs it only once that PUT's response is back.
 *
 * The transport here is a small stand-in backend whose draft write lands *when
 * the test says so*, which is how the late arrival is modelled. The assertion
 * that matters is `server.draftValue`: the client heals itself either way (the
 * refetch overwrites it), the backend does not.
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

const PATH = "hero.body";
const PUBLISHED = "yayınlanmış metin";
const TYPED = "yeni metin";

const baseBlock = () => ({
  blockPath: PATH,
  blockType: "LongText",
  value: PUBLISHED,
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

/** Stand-in backend state, so "did a stale draft survive" is answerable. */
let server;
/** Write calls in invocation order. */
let calls;
let draftPuts;
let contentPuts;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve: /** @type {*} */ (resolve), reject: /** @type {*} */ (reject) };
}

const probe = /** @type {{ setDraft: *, save: *, dirtyCount: number }} */ ({});

function Probe() {
  probe.setDraft = useCmsContext().setDraft;
  const { save, dirtyCount } = useCmsSave();
  probe.save = save;
  probe.dirtyCount = dirtyCount;
  return null;
}

/** Let timers fire and everything they chain settle. */
async function tick(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Flush pending microtasks without moving the clock. */
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  server = { value: PUBLISHED, draftValue: null, version: 1 };
  calls = [];
  draftPuts = [];
  contentPuts = [];
  contentFetches = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Held so a test can observe the window between a publish and its refetch. */
let contentFetches;

async function landContentFetches() {
  for (const f of contentFetches.splice(0)) f.land();
  await settle();
}

const transport = {
  getContent: () => {
    const d = deferred();
    contentFetches.push({
      land: () => d.resolve({ slug: "/", blocks: [{ ...baseBlock(), ...server }] }),
    });
    return d.promise;
  },
  getMyCollections: async () => [],
  updateDraft: (request) => {
    calls.push("updateDraft");
    const d = deferred();
    draftPuts.push({
      request,
      // Applied on land, not on call: that is the late arrival being modelled.
      land: () => {
        server = { ...server, draftValue: request.blocks[0].value };
        d.resolve(undefined);
      },
    });
    return d.promise;
  },
  updateContent: (request) => {
    calls.push("updateContent");
    const d = deferred();
    contentPuts.push({
      request,
      land: () => {
        server = { value: request.blocks[0].value, draftValue: null, version: server.version + 1 };
        d.resolve({ updated: 1, unchanged: 0 });
      },
      reject: /** @param {Error} err */ (err) => d.reject(err),
    });
    return d.promise;
  },
  deleteDraft: async () => {
    calls.push("deleteDraft");
    server = { ...server, draftValue: null };
  },
};

async function mount() {
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[baseBlock()]}
      >
        <Probe />
      </CmsProvider>,
    );
  });
  // The admin mount fires its own refetch; settle it so tests start clean.
  await landContentFetches();
}

describe("publish vs. an in-flight draft autosave", () => {
  it("orders the cleanup behind the draft write it raced, leaving no stale draft", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    await tick();
    expect(draftPuts).toHaveLength(1);

    let saved;
    await act(async () => { saved = probe.save(); });
    expect(contentPuts).toHaveLength(1);

    await act(async () => { contentPuts[0].land(); });
    // Enqueued, not sent: the lane still holds the unfinished draft PUT.
    expect(calls).not.toContain("deleteDraft");

    await act(async () => { draftPuts[0].land(); });
    await settle();
    await act(async () => { await saved; });

    expect(calls).toEqual(["updateDraft", "updateContent", "deleteDraft"]);
    expect(server.value).toBe(TYPED);
    expect(server.draftValue).toBe(null);

    await landContentFetches();
  });

  it("keeps the block clean while the post-publish refetch is still out", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    await tick();

    let saved;
    await act(async () => { saved = probe.save(); });
    await act(async () => { contentPuts[0].land(); });
    await act(async () => { await saved; });

    // The late draft write lands here, with the refetch still in flight. Its
    // mirror would put `draftValue` back on a block the store still shows at the
    // old published value, i.e. dirty again seconds after the user saved.
    await act(async () => { draftPuts[0].land(); });
    await settle();
    expect(contentFetches.length).toBeGreaterThan(0);
    expect(probe.dirtyCount).toBe(0);

    await landContentFetches();
    expect(probe.dirtyCount).toBe(0);
  });

  it("still cleans up when nothing was in flight", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    let saved;
    await act(async () => { saved = probe.save(); });
    await act(async () => { contentPuts[0].land(); });
    await settle();
    await act(async () => { await saved; });

    // The debounce never fired, so the publish is the only write before it.
    expect(calls).toEqual(["updateContent", "deleteDraft"]);
    expect(server.draftValue).toBe(null);

    await landContentFetches();
  });

  it("leaves the lane alone when the publish fails", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    let saved;
    await act(async () => { saved = probe.save(); });
    await act(async () => { contentPuts[0].reject(new Error("boom")); });
    await act(async () => { await saved; });

    // Drafts survive for a retry, so the autosave must still reach the server.
    await tick();
    expect(calls).toEqual(["updateContent", "updateDraft"]);
    await act(async () => { draftPuts[0].land(); });
    expect(server.draftValue).toBe(TYPED);

    await landContentFetches();
  });
});
