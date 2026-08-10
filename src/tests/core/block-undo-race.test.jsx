// @vitest-environment jsdom
/**
 * Per-block undo against an autosave that is already in flight.
 *
 * `draftValue == null` only means "no PUT has come back yet", so an undo that
 * dropped the local entry used to be reverted by that PUT's mirror the moment
 * it landed (admin/BlockCard `resetBlock`). The card now pins the published
 * value instead, and the provider drops that pin once the round-trip settles.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

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
import { BlockCard } from "../../admin/BlockCard.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
// Through the catalog: the panel's wording is configurable, so a literal here
// would break on a reword rather than on a bug.
import { en } from "../../shared/i18n/en/index.js";

const PATH = "hero.body";
const PUBLISHED = "yayınlanmış metin";
const TYPED = "yeni metin";

const BLOCK = {
  blockPath: PATH,
  blockType: "LongText",
  value: PUBLISHED,
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
};

/** Draft PUTs, each left pending so the test decides when it lands. */
let draftPuts;
let transport;

/** Live view of the block + its local draft, read by the assertions. */
const probe = /** @type {{ block: *, hasDraft: boolean, draft: * , setDraft: * }} */ ({});

function Probe() {
  const { blocksStore, contentDraftsStore, setDraft } = useCmsContext();
  probe.block = useStoreSelector(blocksStore, (s) => s.get("/")?.get(PATH));
  probe.hasDraft = useStoreSelector(contentDraftsStore, (m) => m.has(PATH));
  probe.draft = useStoreSelector(contentDraftsStore, (m) => m.get(PATH));
  probe.setDraft = setDraft;
  return null;
}

/** Let the debounce fire and every promise it chains settle. */
async function tick(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  draftPuts = [];
  transport = {
    getContent: async () => ({ slug: "/", blocks: [BLOCK] }),
    getMyCollections: async () => [],
    updateDraft: (request) =>
      new Promise((resolve) => {
        draftPuts.push({ request, land: () => resolve(undefined) });
      }),
    deleteDraft: async () => {},
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[BLOCK]}
      >
        <Probe />
        <BlockCard
          block={BLOCK}
          displayPath={PATH}
          topLevel
          isActive={false}
          itemSchema={null}
        />
      </CmsProvider>,
    );
  });
}

const clickUndo = () =>
  fireEvent.click(screen.getByLabelText(en["block.undoThis"]));

describe("per-block undo vs. an in-flight draft autosave", () => {
  it("survives the mirror of a PUT that was already on the wire", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    await tick();
    expect(draftPuts).toHaveLength(1);
    expect(draftPuts[0].request.blocks[0].value).toBe(TYPED);

    clickUndo();
    await act(async () => { draftPuts[0].land(); });

    // The mirror ran (the race is real), and the undo still won.
    expect(probe.block.draftValue).toBe(TYPED);
    expect(probe.hasDraft).toBe(true);
    expect(probe.draft).toBe(PUBLISHED);
  });

  it("pushes the undo to the backend, then drops the pinned draft", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    await tick();
    clickUndo();
    await act(async () => { draftPuts[0].land(); });

    // Chained behind the write it raced, so this flush sees the mirrored
    // `draftValue` and sends the published value to clear the backend's copy.
    await tick();
    expect(draftPuts).toHaveLength(2);
    expect(draftPuts[1].request.blocks[0].value).toBe(PUBLISHED);

    await act(async () => { draftPuts[1].land(); });
    expect(probe.block.draftValue).toBe(null);
    // Settled: the pin is gone, so the block tracks the server again.
    expect(probe.hasDraft).toBe(false);
  });

  it("sends nothing when the undo beats the debounce", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, TYPED); });
    clickUndo();
    await tick();

    expect(draftPuts).toHaveLength(0);
    expect(probe.hasDraft).toBe(false);
  });
});
