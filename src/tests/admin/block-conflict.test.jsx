// @vitest-environment jsdom
/**
 * Per-block conflict resolution in the drawer.
 *
 * A 409 leaves the two candidate values already sitting in the store: the
 * refetch puts the other editor's text in `block.value` while the local draft
 * still holds this user's. The card's job is to show that difference and offer
 * the two ways out, so these tests drive the store directly rather than going
 * through a save round-trip (that path is covered in tests/core).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";

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
// Through the catalog, not a literal: the panel's wording is configurable now,
// and a test pinned to one language breaks on a reword rather than on a bug.
import { en } from "../../shared/i18n/en/index.js";

const PATH = "hero.title";
const THEIRS = "Onların başlığı";
const MINE = "Benim başlığım";

const BLOCK = {
  blockPath: PATH,
  blockType: "ShortText",
  // Post-refetch state: `value` is what the other editor published.
  value: THEIRS,
  draftValue: null,
  version: 4,
  sortOrder: 1,
  _slug: "/",
};

const ctx = /** @type {{ setDraft: *, setBlockConflicts: *, draft: *, hasConflict: boolean }} */ ({});

function Probe() {
  const c = useCmsContext();
  ctx.setDraft = c.setDraft;
  ctx.setBlockConflicts = c.setBlockConflicts;
  ctx.draft = useStoreSelector(c.contentDraftsStore, (m) => m.get(PATH));
  ctx.hasConflict = useStoreSelector(c.uiStore, (s) => s.conflictBlocks.has(PATH));
  return null;
}

async function mount() {
  await act(async () => {
    render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ ({
          getContent: async () => ({ slug: "/", blocks: [BLOCK] }),
          getMyCollections: async () => [],
        })}
        isAdmin
        initialBlocks={[BLOCK]}
      >
        <Probe />
        <BlockCard block={BLOCK} displayPath={PATH} topLevel isActive={false} itemSchema={null} />
      </CmsProvider>,
    );
  });
}

/** Put the card in the state a 409 leaves behind. */
function raiseConflict() {
  act(() => { ctx.setDraft(PATH, MINE); });
  act(() => { ctx.setBlockConflicts([PATH]); });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("block conflict resolution", () => {
  it("shows nothing until the block is flagged", async () => {
    await mount();
    act(() => { ctx.setDraft(PATH, MINE); });
    expect(screen.queryByRole("group", { name: en["conflict.label"] })).toBe(null);
  });

  it("surfaces both candidate values once flagged", async () => {
    await mount();
    raiseConflict();

    const panel = screen.getByRole("group", { name: en["conflict.label"] });
    // The diff renders the server's text and the user's, so the choice is
    // visible rather than implied.
    expect(panel.textContent).toContain(THEIRS);
    expect(panel.textContent).toContain(MINE);
  });

  it("takes theirs by pinning the published value and dropping the flag", async () => {
    await mount();
    raiseConflict();

    fireEvent.click(screen.getByText(en["conflict.takeTheirs"]));

    expect(ctx.draft).toBe(THEIRS);
    expect(ctx.hasConflict).toBe(false);
    // The panel owns its exit animation, so it leaves the DOM a beat later.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: en["conflict.label"] })).toBe(null),
    );
  });

  it("keeps mine by leaving the draft alone and dropping the flag", async () => {
    await mount();
    raiseConflict();

    fireEvent.click(screen.getByText(en["conflict.keepMine"]));

    // Untouched, so the next save writes it at the refetched version.
    expect(ctx.draft).toBe(MINE);
    expect(ctx.hasConflict).toBe(false);
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: en["conflict.label"] })).toBe(null),
    );
  });
});
