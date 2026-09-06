// @vitest-environment jsdom
/**
 * Which card stays open when the list is reordered.
 *
 * The cards used to own the flag themselves and were keyed by position, so
 * React handed the open state to whichever item slid into that slot: you
 * expanded a row, moved it down, and a different row was open. The list holds
 * the state now and remaps it alongside every move.
 *
 * Driven through a stateful wrapper because `ListEditor` is controlled: with a
 * mock `onChange` the value never changes, which is exactly the case this is
 * about.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { useState } from "react";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";

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
import { ListEditor } from "../../editors/ListEditor.jsx";

const ITEM_SCHEMA = { name: { blockType: "ShortText", defaultValue: "" } };

const transport = {
  getContent: async () => ({ slug: "/", blocks: [] }),
  getMyCollections: async () => [],
  updateDraft: async () => undefined,
  updateContent: async () => ({ updated: 1, unchanged: 0 }),
  deleteDraft: async () => undefined,
};

function Harness() {
  const [items, setItems] = useState([{ name: "Ada" }, { name: "Bora" }, { name: "Cem" }]);
  return (
    <ListEditor blockPath="team.members" value={items} onChange={setItems} itemSchema={ITEM_SCHEMA} />
  );
}

async function mount() {
  await act(async () => {
    render(
      <CmsProvider config={{ baseUrl: "https://api.test" }} transport={/** @type {*} */ (transport)} isAdmin>
        <Harness />
      </CmsProvider>,
    );
  });
}

/** An expanded card is the only one showing its fields, so the inputs name it. */
const openValues = () =>
  /** @type {HTMLInputElement[]} */ (screen.queryAllByRole("textbox")).map((el) => el.value);

/** Let a close animation finish before reading which cards are open. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 300)); });

/**
 * Drive a reorder the way the seat badge does: double-click the readout, type
 * the destination, press Enter.
 *
 * @param {number} from  Zero-based row to pick up.
 * @param {number} seat  One-based destination, as an editor would type it.
 */
async function moveToSeat(from, seat) {
  // Found by shape rather than by copy: this file renders against the real
  // string catalog, so an aria-label match would break on a wording change.
  const badges = Array.from(document.querySelectorAll('span[role="button"]'))
    .filter((el) => /^\d+$/.test(el.textContent?.trim() ?? ""));
  // Two acts, not one: the readout only becomes an input once React has
  // flushed, and inside a single act callback the DOM is still the old one.
  await act(async () => { fireEvent.doubleClick(badges[from]); });
  const input = /** @type {HTMLInputElement} */ (
    document.querySelector('input[inputmode="numeric"]')
  );
  await act(async () => {
    fireEvent.change(input, { target: { value: String(seat) } });
    fireEvent.keyDown(input, { key: "Enter" });
  });
}

afterEach(cleanup);

describe("open state through a reorder", () => {
  it("keeps the expanded card on the item that moved, not the slot", async () => {
    await mount();

    fireEvent.click(screen.getByText("Ada"));
    expect(openValues()).toEqual(["Ada"]);

    // Ada is first; send her to seat 2 through the position field, which is
    // now the only reorder path a test can drive (the other is a real drag).
    await moveToSeat(0, 2);
    // The body of the row that closed is still on screen while it folds, and
    // AnimatePresence keeps its last tree, so a read taken mid-exit sees two.
    await settle();

    expect(openValues()).toEqual(["Ada"]);
  });

  it("keeps the expanded card when a row above it is deleted", async () => {
    await mount();

    fireEvent.click(screen.getByText("Cem"));
    expect(openValues()).toEqual(["Cem"]);

    await act(async () => {
      fireEvent.click(screen.getAllByLabelText("Delete")[0]);
    });

    expect(openValues()).toEqual(["Cem"]);
  });

  // Only opening is asserted: a closing card animates out, so in jsdom its body
  // is still in the tree at the point the assertion would run.
  it("opens cards independently of each other", async () => {
    await mount();

    fireEvent.click(screen.getByText("Ada"));
    expect(openValues()).toEqual(["Ada"]);

    fireEvent.click(screen.getByText("Cem"));
    expect(openValues().sort()).toEqual(["Ada", "Cem"]);
  });
});
