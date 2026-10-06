// @vitest-environment jsdom
/**
 * A save refreshes every list of its collection without blanking it. The
 * windows used to be dropped, so a page region fell back to its loading state
 * until the refetch landed: its rows unmounted, their editors with them, and
 * the drawer's section for the region disappeared and came back.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";

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
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { CollectionRegion } from "../../collections/CollectionRegion.jsx";
import { CollectionField } from "../../collections/CollectionField.jsx";
import { useCollectionContext } from "../../collections/context.js";

const row = (slug, title, version = 1) => ({
  id: `id-${slug}`, collectionKey: "news", slug, data: { title }, version, canEdit: true,
});
const page = (items) => ({ items, total: items.length, offset: 0, limit: 50, virtualItems: [] });

const probe = /** @type {{ ctx?: * }} */ ({});
function Probe() {
  probe.ctx = useCollectionContext();
  return null;
}

afterEach(() => {
  cleanup();
});

describe("a client collection region after a save in its collection", () => {
  it("keeps its rows on screen while the list refetches", async () => {
    /** @type {(value: *) => void} */
    let answerRefetch = () => {};
    const getCollection = vi.fn()
      .mockResolvedValueOnce(page([row("bahar", "Bahar Şenliği")]))
      .mockImplementationOnce(() => new Promise((resolve) => { answerRefetch = resolve; }));

    render(
      <CmsProvider
        collections={CollectionProvider}
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ ({ getCollection, getMyCollections: async () => [] })}
      >
        <Probe />
        <CollectionRegion collection="news" fallback={<p>yükleniyor</p>}>
          <CollectionField name="title" as="p" />
        </CollectionRegion>
      </CmsProvider>,
    );
    await waitFor(() => expect(screen.getByText("Bahar Şenliği")).toBeTruthy());

    await act(async () => {
      probe.ctx.updateCollectionItem("news", "bahar", row("bahar", "Bahar Şenliği 2026", 2));
    });
    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("yükleniyor")).toBeNull();
    // The saved row shows what was published, not what it had before the save.
    expect(screen.getByText("Bahar Şenliği 2026")).toBeTruthy();

    await act(async () => {
      answerRefetch(page([row("bahar", "Bahar Şenliği 2026", 2)]));
    });
    expect(screen.getByText("Bahar Şenliği 2026")).toBeTruthy();
  });

  it("asks once, without falling back to loading, when the refetch fails", async () => {
    const getCollection = vi.fn()
      .mockResolvedValueOnce(page([row("bahar", "Bahar Şenliği")]))
      .mockRejectedValue(new Error("offline"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CmsProvider
        collections={CollectionProvider}
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ ({ getCollection, getMyCollections: async () => [] })}
      >
        <Probe />
        <CollectionRegion collection="news" fallback={<p>yükleniyor</p>} error={<p>hata</p>}>
          <CollectionField name="title" as="p" />
        </CollectionRegion>
      </CmsProvider>,
    );
    await waitFor(() => expect(screen.getByText("Bahar Şenliği")).toBeTruthy());
    let fellBack = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes("yükleniyor")) fellBack = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    await act(async () => {
      probe.ctx.updateCollectionItem("news", "bahar", row("bahar", "Bahar Şenliği 2026", 2));
    });
    await waitFor(() => expect(screen.getByText("hata")).toBeTruthy());
    await act(async () => {});
    observer.disconnect();

    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(fellBack).toBe(false);
    errors.mockRestore();
  });

  it("asks again on the next save after a refetch failed", async () => {
    const getCollection = vi.fn()
      .mockResolvedValueOnce(page([row("bahar", "Bahar Şenliği")]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(page([row("bahar", "Bahar Şenliği 2026", 3)]));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CmsProvider
        collections={CollectionProvider}
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ ({ getCollection, getMyCollections: async () => [] })}
      >
        <Probe />
        <CollectionRegion collection="news" fallback={<p>yükleniyor</p>} error={<p>hata</p>}>
          <CollectionField name="title" as="p" />
        </CollectionRegion>
      </CmsProvider>,
    );
    await waitFor(() => expect(screen.getByText("Bahar Şenliği")).toBeTruthy());
    await act(async () => {
      probe.ctx.updateCollectionItem("news", "bahar", row("bahar", "Bahar Şenliği 2026", 2));
    });
    await waitFor(() => expect(screen.getByText("hata")).toBeTruthy());

    await act(async () => {
      probe.ctx.updateCollectionItem("news", "bahar", row("bahar", "Bahar Şenliği 2026", 3));
    });
    await waitFor(() => expect(screen.getByText("Bahar Şenliği 2026")).toBeTruthy());
    expect(getCollection).toHaveBeenCalledTimes(3);
    errors.mockRestore();
  });
});
