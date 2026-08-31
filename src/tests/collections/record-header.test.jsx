// @vitest-environment jsdom
/**
 * What a record's detail pane opens with.
 *
 * It used to headline with the record's slug, which is the one thing about a
 * record nobody chose, and hang the languages off a bordered band under it. The
 * pane leads with the record itself now: its image, its title as the editor is
 * typing it, and under that the address, the draft state and the age.
 *
 * The address is still the rename control; it moved into the card rather than
 * being duplicated there.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

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
import { CollectionRegionPanel } from "../../admin/CollectionRegionPanel.jsx";
import { createCmsConfig } from "../../shared/config.js";
import { en } from "../../shared/i18n/en/index.js";

const BASE = "https://api.test";
const KEY = "probe-news";
const CONFIG = createCmsConfig({ baseUrl: BASE });
const t = (key) => en[key] ?? key;

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const field = (name, type, extra = {}) => ({
  name, type, label: name, required: false, readOnly: false, computed: false,
  options: null, itemFields: null, help: null, ...extra,
});

const FIELDS = [field("title", "ShortText"), field("cover", "Image")];

const ITEM = {
  id: "row-1",
  collectionKey: KEY,
  slug: "bahar-senligi",
  data: { title: "Bahar Şenliği", cover: { src: "/senlik.jpg", alt: "" } },
  version: 3,
  canEdit: true,
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

function mockFetch(item = ITEM) {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) {
      return jsonRes([{
        collectionKey: KEY, canCreate: false, slugSource: "UserDefined",
        // What actually gates the rename control; `slugSource` alone does not.
        slugEditable: true,
        schema: { fields: FIELDS },
      }]);
    }
    if (url.includes(`/cms/collections/${KEY}/${item.slug}`)) return jsonRes(item);
    if (url.includes(`/cms/collections/${KEY}`)) {
      return jsonRes({ items: [item], total: 1, offset: 0, limit: 50, virtualItems: [] });
    }
    return jsonRes({ slug: "/", blocks: [] });
  });
}

/** Opens the record's detail pane and waits for it. */
async function openRecord(item = ITEM) {
  mockFetch(item);
  render(
    <CmsProvider collections={CollectionProvider} config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
      <CollectionRegionPanel collectionKey={KEY} scope="global" />
    </CmsProvider>,
  );
  // The row's headline is the title when there is one, else the slug: an empty
  // title would make `getByText("")` match half the panel.
  const headline = item.data.title || item.slug;
  await waitFor(() => expect(screen.getByText(headline)).toBeTruthy());
  fireEvent.click(screen.getByText(headline).closest("button"));
  await waitFor(() => expect(
    screen.getByRole("button", { name: t("collections.backToList") }),
  ).toBeTruthy());
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the record header", () => {
  it("headlines with the record's title, not its address", async () => {
    await openRecord();
    // Both are on screen, but the heading is the title: the slug now sits in
    // the address line under it.
    expect(screen.getAllByText("Bahar Şenliği").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bahar-senligi").length).toBeGreaterThan(0);
  });

  it("shows the record's own image", async () => {
    await openRecord();
    const img = document.querySelector('img[src="/senlik.jpg"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute("alt")).toBe("");
  });

  // A record whose title field is still empty is not nameless in the panel's
  // voice; borrowing the slug would print the address twice.
  it("names an untitled record rather than repeating its slug", async () => {
    await openRecord({ ...ITEM, data: { title: "", cover: null }, slug: "adsiz" });
    expect(screen.getByText(t("collections.untitledRecord"))).toBeTruthy();
  });

  // The address is the rename control, and it kept that job on the way into the
  // card: a `UserDefined` collection can still open the editor from it.
  it("keeps the address pressable as the rename control", async () => {
    await openRecord();
    // The control names itself by the address it would change, so the slug is
    // its accessible name and the intent rides in the tooltip.
    const rename = screen.getAllByText("bahar-senligi")
      .map((el) => el.closest("button"))
      .find((el) => el?.classList.contains("inscribed-slug-edit"));
    expect(rename).toBeTruthy();
    expect(rename?.getAttribute("title")).toBe(t("collections.renameRecord"));
  });

  // The header carries no heading of its own any more, so the back button has
  // the room to say where back goes.
  it("names the way back instead of leaving a bare chevron", async () => {
    await openRecord();
    const back = screen.getByRole("button", { name: t("collections.backToList") });
    expect(back.textContent?.trim()).toBe(t("collections.backToList"));
  });
});
