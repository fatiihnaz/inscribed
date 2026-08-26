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

afterEach(cleanup);

describe("open state through a reorder", () => {
  it("keeps the expanded card on the item that moved, not the slot", async () => {
    await mount();

    fireEvent.click(screen.getByText("Ada"));
    expect(openValues()).toEqual(["Ada"]);

    // Ada is first, so the only move available is down.
    await act(async () => {
      fireEvent.click(screen.getAllByLabelText("Move down")[0]);
    });

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
