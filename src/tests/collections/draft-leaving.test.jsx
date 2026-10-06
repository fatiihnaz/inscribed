// @vitest-environment jsdom
/**
 * A record draft still inside the autosave debounce when the collection layer
 * unmounts, as it does with the provider on a language switch.
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
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { useCollectionContext } from "../../collections/context.js";

const probe = /** @type {{ queue: import("../../shared/state/draft-queue.js").DraftQueue }} */ ({});

function Probe() {
  probe.queue = useCollectionContext().draftQueue;
  return null;
}

const tree = () => (
  <CmsProvider
    collections={CollectionProvider}
    config={{ baseUrl: "https://api.test" }}
    transport={/** @type {*} */ ({ getMyCollections: async () => [] })}
    isAdmin
    initialSite={{ pages: [], global: [] }}
  >
    <Probe />
  </CmsProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a record draft left inside the autosave debounce", () => {
  it("is written after the provider unmounts", async () => {
    let view;
    await act(async () => {
      view = render(tree());
    });
    const write = vi.fn();
    act(() => probe.queue.schedule("news:bahar", write));

    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(write).toHaveBeenCalledTimes(1);
  });
});
