// @vitest-environment jsdom
/**
 * Tests for `<CollectionRecord>` fed a record the server read with its service
 * key: that read carries neither `canEdit` nor the editor's draft, so an admin's
 * editing chrome has to come from their own read of the record.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/news",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { CollectionRecord } from "../../collections/CollectionItem.jsx";
import { CollectionField } from "../../collections/CollectionField.jsx";
import { en } from "../../shared/i18n/en/index.js";

const BASE = "https://api.test";
const ITEM_URL = /\/cms\/collections\/news\/q1/;

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const newsMeta = {
  collectionKey: "news",
  canCreate: false,
  slugSource: "UserDefined",
  schema: {
    fields: [{
      name: "title", label: "title", type: "ShortText", required: false, readOnly: false,
      options: null, fields: null, help: null,
    }],
  },
};

// What `createCmsPage` hands over: the backend omits `canEdit` and `draftData`
// for a caller without content:write.
const SERVER_ITEM = {
  id: "row-1", collectionKey: "news", slug: "q1", data: { title: "Q1 raporu" }, version: 3,
};

function mockFetch({ canEdit = true, draftData = null } = {}) {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([newsMeta]);
    if (ITEM_URL.test(url)) return jsonRes({ ...SERVER_ITEM, canEdit, draftData });
    return jsonRes({ slug: "/news", blocks: [] });
  });
}

const itemReads = () => global.fetch.mock.calls.filter(([input]) => ITEM_URL.test(String(input)));

function renderRecord({ isAdmin = true } = {}) {
  return render(
    <CmsProvider collections={CollectionProvider} config={{ baseUrl: BASE }} isAdmin={isAdmin} getAccessToken={async () => "tok"}>
      <CollectionRecord collection="news" slug="q1" item={SERVER_ITEM}>
        <article>
          <CollectionField name="title" as="h1" />
        </article>
      </CollectionRecord>
    </CmsProvider>,
  );
}

const editable = () => document.querySelector("[contenteditable]");
const chipName = en["collections.openRecordInPanel"].replace("{label}", "news · q1");

function hoverRecord() {
  fireEvent.mouseEnter(/** @type {Element} */ (document.querySelector("article")?.parentElement));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a server-read record", () => {
  it("gets the editing chrome once the admin's own read says they can edit it", async () => {
    mockFetch();
    renderRecord();
    await waitFor(() => expect(editable()?.textContent).toBe("Q1 raporu"));
    hoverRecord();
    expect(screen.getByRole("button", { name: chipName })).toBeTruthy();
  });

  it("marks the chip dirty from the admin's own draft", async () => {
    mockFetch({ draftData: { title: "Taslak" } });
    renderRecord();
    await waitFor(() => expect(editable()).not.toBeNull());
    hoverRecord();
    const chip = screen.getByRole("button", { name: chipName });
    expect(chip.querySelector(`[aria-label="${en["block.unsavedDot"]}"]`)).not.toBeNull();
  });

  it("stays read-only when the admin's own read says no", async () => {
    mockFetch({ canEdit: false });
    renderRecord();
    await waitFor(() => expect(itemReads().length).toBeGreaterThan(0));
    await act(async () => {});
    hoverRecord();
    expect(editable()).toBeNull();
    expect(screen.queryByRole("button", { name: chipName })).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Q1 raporu");
  });

  it("never reads the record again for a visitor", async () => {
    mockFetch();
    renderRecord({ isAdmin: false });
    await act(async () => {});
    expect(screen.getByRole("heading").textContent).toBe("Q1 raporu");
    expect(itemReads()).toHaveLength(0);
  });
});
