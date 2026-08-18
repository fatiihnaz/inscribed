// @vitest-environment jsdom
/**
 * Tests for the `virtualItems` side of the list envelope: rows the editor may
 * write that have no record yet. They must stay out of `items` and `total`,
 * normalise to `[]` when the backend sends none, and go through the same draft
 * overlay as persisted rows so a derived row previews live edits.
 * Mounted through the real CmsProvider/CollectionProvider stack with a mocked
 * fetch, same pattern as the composer tests.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor, act } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/teams",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { useCollection } from "../../collections/hooks/use-collection.js";
import { useCollectionContext } from "../../collections/context.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const persisted = {
  id: "row-1",
  collectionKey: "teams",
  slug: "tasarim",
  data: { name: "Tasarım" },
  version: 3,
  canEdit: true,
};

const derived = {
  origin: "derived",
  slug: "web",
  canEdit: true,
  data: { memberCount: 12 },
};

const pending = {
  origin: "pending",
  canEdit: true,
  data: {},
  draftData: { name: "Yarım takım" },
  updatedAt: "2026-08-11T06:06:46Z",
};

function mockFetch(envelope) {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    if (url.includes("/cms/collections/teams")) return jsonRes(envelope);
    return jsonRes({ slug: "/teams", blocks: [] });
  });
}

/** Latest hook result, plus the store handles a test needs to drive a draft. */
let seen;

function Probe() {
  const result = useCollection("teams");
  const { setCollectionDraft } = useCollectionContext();
  seen = { ...result, setCollectionDraft };
  return null;
}

function renderProbe(envelope) {
  seen = undefined;
  mockFetch(envelope);
  return render(
    <CmsProvider collections={CollectionProvider} config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
      <Probe />
    </CmsProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("virtualItems in the list envelope", () => {
  it("surfaces virtual rows without folding them into items or total", async () => {
    renderProbe({
      items: [persisted],
      total: 1,
      offset: 0,
      limit: 50,
      virtualItems: [pending, derived],
    });

    await waitFor(() => expect(seen.isLoading).toBe(false));
    expect(seen.items).toHaveLength(1);
    expect(seen.total).toBe(1);
    expect(seen.virtualItems.map((r) => r.origin)).toEqual(["pending", "derived"]);
  });

  it("normalises a missing virtualItems to an empty array", async () => {
    renderProbe({ items: [persisted], total: 1, offset: 0, limit: 50 });

    await waitFor(() => expect(seen.isLoading).toBe(false));
    expect(seen.virtualItems).toEqual([]);
  });

  it("promotes draftData over data on a pending row", async () => {
    renderProbe({ items: [], total: 0, offset: 0, limit: 50, virtualItems: [pending] });

    await waitFor(() => expect(seen.isLoading).toBe(false));
    expect(seen.virtualItems[0].data).toEqual({ name: "Yarım takım" });
  });

  it("overlays a live local draft onto a derived row", async () => {
    renderProbe({ items: [], total: 0, offset: 0, limit: 50, virtualItems: [derived] });

    await waitFor(() => expect(seen.isLoading).toBe(false));
    expect(seen.virtualItems[0].data).toEqual({ memberCount: 12 });

    act(() => {
      seen.setCollectionDraft("teams", "web", { name: "Web ekibi" });
    });

    // The draft subscription has to cover derived slugs, or the list would sit
    // on the pre-edit value while that row's editor types.
    await waitFor(() => {
      expect(seen.virtualItems[0].data).toEqual({ name: "Web ekibi" });
    });
  });

  it("leaves the slug-less pending row alone when another row's draft moves", async () => {
    renderProbe({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
      virtualItems: [pending, derived],
    });

    await waitFor(() => expect(seen.isLoading).toBe(false));

    act(() => {
      seen.setCollectionDraft("teams", "web", { name: "Web ekibi" });
    });

    await waitFor(() => {
      expect(seen.virtualItems[1].data).toEqual({ name: "Web ekibi" });
    });
    expect(seen.virtualItems[0].data).toEqual({ name: "Yarım takım" });
  });
});
