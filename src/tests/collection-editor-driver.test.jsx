// @vitest-environment jsdom
/**
 * Exactly one surface may drive a record's autosave. Two surfaces PUTting the
 * same draft slot race, and the loser's payload is whatever it happened to be
 * holding (see the `active` / `mirror` contract, AdminCollectionEditor.jsx:92-105).
 *
 * The election works where it is written down: CollectionItem.jsx:216-229 stands
 * the page scope down unless it is the elected one, AdminBlockCard.jsx:390-395
 * stands the drawer card down while page fields exist. The rail's detail pane
 * calls `useCollectionEditor` with bare defaults (AdminCollectionRegionPanel.jsx:617),
 * so it always claims `active: true` — case A is that hole.
 *
 * Case B is the create path, which has no election at all: `useCollectionCreate`
 * takes `active` from its caller, and both the page composer
 * (CollectionComposer.jsx:116) and the rail's create pane
 * (AdminCollectionRegionPanel.jsx:734) pass the default `true` while POSTing to
 * the same `/cms/collections/{key}/drafts` slot.
 *
 * Two surfaces is the ceiling, not three: the drawer's `mode === "collections"`
 * branch is exclusive (AdminDrawer.jsx:610), so its Page-tab Collection card and
 * the rail's detail pane can never be mounted at the same time.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { useEffect, useRef } from "react";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/haberler",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../components/CmsProvider.jsx";
import { CollectionItem } from "../components/CollectionItem.jsx";
import { CollectionField } from "../components/CollectionField.jsx";
import { CollectionComposer } from "../components/CollectionComposer.jsx";
import { AdminCollectionRegionPanel } from "../components/AdminCollectionRegionPanel.jsx";
import { useCollectionContext } from "../lib/collection-context.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });
const noContent = () => new Response(null, { status: 204 });

const field = (name, label, type) => ({
  name, label, type, required: false, readOnly: false,
  options: null, fields: null, help: null,
});

const newsMeta = (overrides = {}) => ({
  collectionKey: "news",
  canCreate: false,
  slugSource: "UserDefined",
  schema: { fields: [field("title", "Başlık", "ShortText"), field("body", "İçerik", "LongText")] },
  ...overrides,
});

/** Every request as [method, url], so a surface's extra write is countable. */
let requests;

function mockFetch({ me = [newsMeta()] } = {}) {
  requests = [];
  global.fetch = vi.fn(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push([method, url]);
    if (url.includes("/cms/collections/me")) return jsonRes(me);
    // Draft writes: only their count matters here.
    if (method !== "GET") return noContent();
    if (/\/cms\/collections\/news\/[^/?]+$/.test(url)) {
      return jsonRes({
        id: "row-1",
        collectionKey: "news",
        slug: "q1",
        data: { title: "Q1 raporu", body: "Uzun metin" },
        version: 3,
        canEdit: true,
      });
    }
    if (url.includes("/cms/collections/news")) {
      return jsonRes({ items: [], total: 0, offset: 0, limit: 50 });
    }
    return jsonRes({ slug: "/haberler", blocks: [] });
  });
}

const requestsTo = (method, path) =>
  requests.filter(([m, u]) => m === method && u === `${BASE}${path}`);

const editableOf = (text) =>
  [...document.querySelectorAll("[contenteditable]")].find((el) => el.textContent === text) ?? null;

const fieldInputs = () => [...document.querySelectorAll("input.inscribed-field")];

/** Hands the collection context out to the test body. */
function Handle({ onReady }) {
  const ctx = useCollectionContext();
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    onReady(() => ref.current);
  }, [onReady]);
  return null;
}

/**
 * Mount and the /me + item round-trips run on the real clock; only the 1s
 * autosave debounce is simulated, and the flush's own awaits ride along with
 * `advanceTimersByTimeAsync`.
 */
async function crossDebounce(interact) {
  vi.useFakeTimers();
  try {
    interact();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("one driver per record", () => {
  it("PUTs the record's draft once with page fields and the rail pane both open", async () => {
    mockFetch();
    let getHandle = () => null;
    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
        <Handle onReady={(getter) => { getHandle = getter; }} />
        <CollectionItem collection="news" slug="q1" fallback={<p>…</p>}>
          <CollectionField name="title" as="h1" />
        </CollectionItem>
        <AdminCollectionRegionPanel collectionKey="news" scope="global" />
      </CmsProvider>,
    );
    await waitFor(() => expect(editableOf("Q1 raporu")).toBeTruthy());

    // The StatusBar "Aç" jump: the rail opens its detail pane on the same
    // record the page is already showing fields for.
    act(() => { getHandle().setActiveCollectionItem({ key: "news", slug: "q1" }); });
    await waitFor(() => expect(screen.getByLabelText("Listeye dön")).toBeTruthy());
    await waitFor(() => expect(fieldInputs()).toHaveLength(1));

    await crossDebounce(() => {
      const el = editableOf("Q1 raporu");
      el.textContent = "Yeni başlık";
      fireEvent.input(el);
    });

    // Both surfaces read the same shared draft, so both send a complete and
    // identical payload — which is exactly why the second request is invisible
    // in the UI and only shows up as a race against the first.
    expect(requestsTo("PUT", "/cms/collections/news/q1/draft")).toHaveLength(1);
  });

  it("leaves the rail pane silent when the page fields are the driver", async () => {
    mockFetch();
    let getHandle = () => null;
    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
        <Handle onReady={(getter) => { getHandle = getter; }} />
        <CollectionItem collection="news" slug="q1" fallback={<p>…</p>}>
          <CollectionField name="title" as="h1" />
        </CollectionItem>
        <AdminCollectionRegionPanel collectionKey="news" scope="global" />
      </CmsProvider>,
    );
    await waitFor(() => expect(editableOf("Q1 raporu")).toBeTruthy());

    act(() => { getHandle().setActiveCollectionItem({ key: "news", slug: "q1" }); });
    await waitFor(() => expect(fieldInputs()).toHaveLength(1));

    // Typed in the pane instead: the page scope still owns the network, and the
    // edit reaches it through the shared draft rather than a second request.
    await crossDebounce(() => {
      fireEvent.change(fieldInputs()[0], { target: { value: "Panelden" } });
    });

    expect(requestsTo("PUT", "/cms/collections/news/q1/draft")).toHaveLength(1);
  });
});

describe("one driver per create slot", () => {
  it("POSTs the new-item draft once with the composer and the rail create pane open", async () => {
    mockFetch({ me: [newsMeta({ canCreate: true, slugSource: "AutoGenerated" })] });
    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
        <CollectionComposer collection="news" />
        <AdminCollectionRegionPanel collectionKey="news" scope="global" />
      </CmsProvider>,
    );
    await waitFor(() => expect(screen.getByText("Yeni news")).toBeTruthy());

    fireEvent.click(screen.getByText("Yeni news"));
    await waitFor(() => expect(fieldInputs()).toHaveLength(2));

    // Both forms hold their own `values` and their own `lastSyncedRef`, so both
    // arm a debounce against the one new-item slot; unlike the record case the
    // payloads differ, and whichever request lands last wins the slot.
    await crossDebounce(() => {
      const [composerTitle, paneTitle] = fieldInputs();
      fireEvent.change(composerTitle, { target: { value: "Composer'dan" } });
      fireEvent.change(paneTitle, { target: { value: "Raydan" } });
    });

    expect(requestsTo("POST", "/cms/collections/news/drafts")).toHaveLength(1);
  });
});
