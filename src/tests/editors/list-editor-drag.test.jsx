// @vitest-environment jsdom
/**
 * Dragging in the drawer's `ListEditor`, where the card header is the handle.
 *
 * Two things separate this from the page-side drag and both are worth pinning:
 * the press has to travel past a threshold before it counts as a drag (so a
 * plain click still opens the card), and the list scrolls inside the drawer's
 * own pane rather than the window, which is what the drop coordinates are
 * measured against.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act, fireEvent, screen, waitFor } from "@testing-library/react";

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
import { ListEditor } from "../../editors/fields/ListEditor.jsx";

const ITEM_SCHEMA = { name: { blockType: "ShortText", defaultValue: "" } };
const ITEMS = [{ name: "Ada" }, { name: "Bora" }, { name: "Cem" }];

const transport = {
  getContent: async () => ({ slug: "/", blocks: [] }),
  getMyCollections: async () => [],
  updateDraft: async () => undefined,
  updateContent: async () => ({ updated: 1, unchanged: 0 }),
  deleteDraft: async () => undefined,
};

/** @type {ReturnType<typeof vi.fn>} */
let onChange;

async function mount(items = ITEMS) {
  onChange = vi.fn();
  await act(async () => {
    render(
      <CmsProvider config={{ baseUrl: "https://api.test" }} transport={/** @type {*} */ (transport)} isAdmin>
        <ListEditor blockPath="team.members" value={items} onChange={onChange} itemSchema={ITEM_SCHEMA} />
      </CmsProvider>,
    );
  });
}

/** The header of each card: the drag handle, and the summary's parent. */
const headers = () =>
  ITEMS.map((_, i) => {
    const badge = screen.getByTitle(`Item ${i + 1} of 3`);
    return /** @type {HTMLElement} */ (badge.parentElement?.parentElement);
  });

/** The outer positioning box each card hangs on, which is what gets measured. */
const wrappers = () => headers().map((h) => h.parentElement?.parentElement);

function stubBoxes(elements, tops) {
  elements.forEach((el, i) => {
    vi.spyOn(/** @type {*} */ (el), "getBoundingClientRect").mockReturnValue(
      /** @type {*} */ ({ left: 0, top: tops[i], width: 300, height: 40, right: 300, bottom: tops[i] + 40 }),
    );
  });
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() { return false; };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("drawer list drag", () => {
  it("reorders to wherever the pointer lands, not always the first slot", async () => {
    await mount();
    stubBoxes(wrappers(), [0, 50, 100]);
    const header = headers()[0];

    await act(async () => {
      fireEvent.pointerDown(header, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
      // Past the 4px threshold: the press becomes a drag.
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 20 });
    });
    await act(async () => {
      // Past the middle of the second card (50 + 20 = 70), short of the third's.
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 95 });
    });
    await act(async () => {
      fireEvent.pointerUp(header, { pointerId: 1 });
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].map((i) => i.name)).toEqual(["Bora", "Ada", "Cem"]);
  });

  it("carries a card to the end", async () => {
    await mount();
    stubBoxes(wrappers(), [0, 50, 100]);
    const header = headers()[0];

    await act(async () => {
      fireEvent.pointerDown(header, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 20 });
    });
    await act(async () => {
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 135 });
    });
    await act(async () => {
      fireEvent.pointerUp(header, { pointerId: 1 });
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].map((i) => i.name)).toEqual(["Bora", "Cem", "Ada"]);
  });

  it("treats a press that never travels as a click, not a drag", async () => {
    await mount();
    stubBoxes(wrappers(), [0, 50, 100]);
    const header = headers()[0];

    await act(async () => {
      fireEvent.pointerDown(header, {
        pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
      });
      // Two pixels of hand-shake: under the threshold.
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 12, clientY: 11 });
      fireEvent.pointerUp(header, { pointerId: 1 });
      fireEvent.click(header);
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
