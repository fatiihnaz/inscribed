// @vitest-environment jsdom
/**
 * Guards the drawer card's render isolation: typing into one block must not
 * re-render another block's editor. The card reads its own draft from the store
 * and builds its own handlers, so `BlockCard`'s memo holds even though the
 * drawer around it re-renders on every keystroke (it aggregates the dirty
 * count). Both halves matter: the memo alone can't survive a fresh `draft`
 * prop or a new arrow handler per render.
 *
 * `FieldEditor` is stubbed as the render counter: it is the leaf every
 * field-weight card renders, so counting it counts the work the split saves.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

const counters = vi.hoisted(() => ({ fieldEditor: 0 }));

vi.mock("../../editors/FieldEditor.jsx", () => ({
  FieldEditor: () => {
    counters.fieldEditor += 1;
    return null;
  },
}));
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

const BASE = "https://api.test";

/** @param {string} blockPath @param {number} sortOrder */
const shortText = (blockPath, sortOrder) => ({
  blockPath,
  blockType: "ShortText",
  value: "",
  draftValue: null,
  version: 1,
  sortOrder,
  _slug: "/",
});

const BLOCKS = [shortText("hero.title", 1), shortText("hero.body", 2)];

/** Mirrors the drawer: subscribes to the whole map, so it re-renders per keystroke. */
function CardList() {
  const { contentDraftsStore } = useCmsContext();
  useStoreSelector(contentDraftsStore, (m) => m);
  return (
    <>
      {BLOCKS.map((block) => (
        <BlockCard
          key={block.blockPath}
          block={block}
          displayPath={block.blockPath}
          topLevel
          isActive={false}
          itemSchema={null}
        />
      ))}
    </>
  );
}

let setDraft = /** @type {(path: string, value: *) => void} */ (() => {});

function Handle() {
  const ctx = useCmsContext();
  setDraft = ctx.setDraft;
  return null;
}

beforeEach(() => {
  counters.fieldEditor = 0;
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockCard render isolation", () => {
  it("re-renders only the edited block's editor", () => {
    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={BLOCKS}>
        <Handle />
        <CardList />
      </CmsProvider>,
    );

    const afterMount = counters.fieldEditor;
    expect(afterMount).toBeGreaterThanOrEqual(2);

    act(() => { setDraft("hero.title", "a"); });
    act(() => { setDraft("hero.title", "ab"); });

    // Exactly one editor render per keystroke: the untouched card sat it out.
    expect(counters.fieldEditor - afterMount).toBe(2);
  });
});
