// @vitest-environment jsdom
/**
 * Tests for `<CollectionField>`: the same element for visitors and admins, an
 * in-place editor only for editable text fields, and the single-driver claim
 * that stands the drawer's card down while page fields exist.
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
  usePathname: () => "/news",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionItem } from "../../collections/CollectionItem.jsx";
import { CollectionField } from "../../collections/CollectionField.jsx";
import { useCollectionContext } from "../../collections/context.js";
import { useCollectionItemScope } from "../../collections/item-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
// Through the catalog: the panel's wording is configurable, so a literal here
// would break on a reword rather than on a bug.
import { en } from "../../shared/i18n/en/index.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const field = (name, type, extra = {}) => ({
  name, label: name, type, required: false, readOnly: false,
  options: null, fields: null, help: null, ...extra,
});

const newsMeta = {
  collectionKey: "news",
  canCreate: false,
  slugSource: "UserDefined",
  schema: {
    fields: [
      field("title", "ShortText"),
      field("body", "LongText"),
      field("article", "RichText"),
      field("publishedAt", "Date"),
      field("hero", "Image"),
      field("locked", "ShortText", { readOnly: true }),
    ],
  },
};

function mockFetch({ me = [newsMeta], canEdit = true, hero = null } = {}) {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes(me);
    if (/\/cms\/collections\/news\/[^/?]+/.test(url)) {
      return jsonRes({
        id: "row-1",
        collectionKey: "news",
        slug: "q1",
        data: {
          title: "Q1 raporu", body: "Uzun metin", publishedAt: "2026-01-01",
          article: '<p>Kalın <strong>metin</strong></p><script>alert(1)</script>',
          hero, locked: "sabit",
        },
        version: 3,
        canEdit,
      });
    }
    return jsonRes({ slug: "/news", blocks: [] });
  });
}

/** The records claimed by mounted `<CollectionField>`s, newest render. */
let claimed;
/** The shared draft map, newest render. */
let sharedDrafts;

function Probe() {
  const { collectionStore } = useCollectionContext();
  // Subscribed, not read once: the point is to see the draft land as it's typed.
  claimed = useStoreSelector(collectionStore, (s) => s.inlineFields);
  sharedDrafts = useStoreSelector(collectionStore, (s) => s.drafts);
  return null;
}

function renderItem({ isAdmin = true, children } = {}) {
  claimed = new Set();
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin={isAdmin} getAccessToken={async () => "tok"}>
      <Probe />
      <CollectionItem collection="news" slug="q1" fallback={<p>…</p>}>
        {children}
      </CollectionItem>
    </CmsProvider>,
  );
}

const editablesOf = (text) =>
  [...document.querySelectorAll("[contenteditable]")].filter((el) => el.textContent === text);
const editableOf = (text) => editablesOf(text)[0] ?? null;

/** Two `<CollectionItem>`s on one record, each with the same editable field. */
function renderTwice(name = "title") {
  claimed = new Map();
  mockFetch();
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
      <Probe />
      {[0, 1].map((i) => (
        <CollectionItem key={i} collection="news" slug="q1" fallback={<p>…</p>}>
          <CollectionField name={name} as="h1" />
        </CollectionItem>
      ))}
    </CmsProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("read-only rendering", () => {
  it("renders the value as plain text for a visitor", async () => {
    mockFetch();
    renderItem({ isAdmin: false, children: <CollectionField name="title" as="h1" /> });
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("Q1 raporu"));
    expect(document.querySelector("[contenteditable]")).toBeNull();
    expect(claimed.size).toBe(0);
  });

  it("renders the value as plain text when the admin can't edit the record", async () => {
    mockFetch({ canEdit: false });
    renderItem({ children: <CollectionField name="title" as="h1" /> });
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("Q1 raporu"));
    expect(document.querySelector("[contenteditable]")).toBeNull();
  });

  it("keeps non-text field types read-only and unclaimed", async () => {
    mockFetch();
    renderItem({
      children: (
        <>
          <CollectionField name="title" as="h1" />
          <CollectionField name="publishedAt" as="time" />
        </>
      ),
    });
    await waitFor(() => expect(editableOf("Q1 raporu")).toBeTruthy());
    expect(document.querySelector("time")?.textContent).toBe("2026-01-01");
    expect(document.querySelector("time")?.getAttribute("contenteditable")).toBeNull();
  });

  it("keeps a readOnly text field out of the editors", async () => {
    mockFetch();
    renderItem({
      children: (
        <>
          <CollectionField name="title" as="h1" />
          <CollectionField name="locked" as="span" />
        </>
      ),
    });
    await waitFor(() => expect(editableOf("Q1 raporu")).toBeTruthy());
    expect(editableOf("sabit")).toBeNull();
  });
});

describe("in-place editing", () => {
  it("renders an editor for an editable text field", async () => {
    mockFetch();
    renderItem({ children: <CollectionField name="title" as="h1" /> });
    await waitFor(() => {
      const el = editableOf("Q1 raporu");
      expect(el).toBeTruthy();
      expect(el.tagName).toBe("H1");
      expect(el.getAttribute("role")).toBe("textbox");
    });
  });

  it("claims the record so the drawer card stops driving the draft", async () => {
    mockFetch();
    renderItem({
      children: (
        <>
          <CollectionField name="title" as="h1" />
          <CollectionField name="body" as="p" />
        </>
      ),
    });
    await waitFor(() => expect(claimed.has("news:q1")).toBe(true));
  });

  it("releases the claim once the fields unmount", async () => {
    mockFetch();
    const { rerender } = renderItem({ children: <CollectionField name="title" as="h1" /> });
    await waitFor(() => expect(claimed.has("news:q1")).toBe(true));

    rerender(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
        <Probe />
        <CollectionItem collection="news" slug="q1">
          <h1>bare</h1>
        </CollectionItem>
      </CmsProvider>,
    );
    await waitFor(() => expect(claimed.has("news:q1")).toBe(false));
  });
});

describe("live draft", () => {
  it("writes the edit into the shared draft as it is typed", async () => {
    mockFetch();
    renderItem({ children: <CollectionField name="title" as="h1" /> });
    const el = await waitFor(() => {
      const found = editableOf("Q1 raporu");
      expect(found).toBeTruthy();
      return found;
    });

    el.textContent = "Yeni başlık";
    fireEvent.input(el);

    // Immediately, not after the 1s autosave debounce: this is the channel the
    // drawer card and any other surface read to stay in step.
    await waitFor(() => expect(sharedDrafts.get("news:q1")?.title).toBe("Yeni başlık"));
    // The rest of the record rides along, so a publish from here is complete.
    expect(sharedDrafts.get("news:q1").body).toBe("Uzun metin");
  });

  it("holds the record scope still while a field is typed in", async () => {
    // Every `<CollectionField>` reads the scope, so the scope is what decides
    // whether one field's keystroke re-renders the whole record. While `values`
    // lived on the editor object it moved with each character, and a schema of
    // any size paid for a single field's edit. Fields select their own value
    // out of the store instead, leaving the scope alone.
    mockFetch();
    let scopeRenders = 0;
    function ScopeProbe() {
      useCollectionItemScope();
      scopeRenders += 1;
      return null;
    }

    renderItem({
      children: (
        <>
          <CollectionField name="title" as="h1" />
          <ScopeProbe />
        </>
      ),
    });
    const el = await waitFor(() => {
      const found = editableOf("Q1 raporu");
      expect(found).toBeTruthy();
      return found;
    });
    await waitFor(() => expect(scopeRenders).toBeGreaterThan(0));

    const before = scopeRenders;
    el.textContent = "Yeni başlık";
    fireEvent.input(el);
    await waitFor(() => expect(sharedDrafts.get("news:q1")?.title).toBe("Yeni başlık"));

    expect(scopeRenders).toBe(before);
  });
});

describe("two presentations of one record", () => {
  it("shows an edit made in one of them in the other", async () => {
    renderTwice();
    await waitFor(() => expect(editablesOf("Q1 raporu")).toHaveLength(2));

    const [first] = editablesOf("Q1 raporu");
    first.textContent = "Yeni başlık";
    fireEvent.input(first);

    await waitFor(() => expect(editablesOf("Yeni başlık")).toHaveLength(2));
  });

  it("reverts both when the draft is undone from one of them", async () => {
    renderTwice();
    await waitFor(() => expect(editablesOf("Q1 raporu")).toHaveLength(2));

    const [first] = editablesOf("Q1 raporu");
    first.textContent = "Yeni başlık";
    fireEvent.input(first);
    await waitFor(() => expect(editablesOf("Yeni başlık")).toHaveLength(2));

    // The ring's actions only appear on hover, same as the label chip.
    fireEvent.mouseEnter(first.parentElement);
    fireEvent.click(screen.getByTitle(en["collections.undoRecordDraft"]));

    // Both, not just the one the button belonged to: a surface that never PUT
    // the draft holds the published value in `lastSyncedRef`, which used to
    // make it skip exactly this re-seed.
    await waitFor(() => expect(editablesOf("Q1 raporu")).toHaveLength(2));
  });
});

describe("rich text fields", () => {
  it("renders sanitised markup for a visitor when told the field holds html", async () => {
    mockFetch();
    renderItem({ isAdmin: false, children: <CollectionField name="article" as="div" html /> });
    await waitFor(() => expect(document.querySelector("strong")).toBeTruthy());
    expect(document.querySelector("strong").textContent).toBe("metin");
    // Sanitised on the read path too, or pasted markup would reach visitors.
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders the markup as text without the flag, and says so in dev", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch();
    renderItem({ children: <CollectionField name="article" as="div" /> });
    await waitFor(() =>
      expect(warn.mock.calls.some(([m]) => String(m).includes("pass `html`"))).toBe(true),
    );
    expect(document.querySelector("strong")).toBeNull();
  });

  it("claims the record so the field can be edited in place", async () => {
    mockFetch();
    renderItem({ children: <CollectionField name="article" as="div" html /> });
    await waitFor(() => expect(claimed.has("news:q1")).toBe(true));
  });
});

describe("image fields", () => {
  it("renders the picture for a visitor", async () => {
    mockFetch({ hero: { src: "https://cdn.test/a.png", alt: "Kapak" } });
    renderItem({ isAdmin: false, children: <CollectionField name="hero" /> });
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img.getAttribute("src")).toBe("https://cdn.test/a.png");
    expect(img.getAttribute("alt")).toBe("Kapak");
  });

  it("claims the record and renders the picture for an editor", async () => {
    mockFetch({ hero: { src: "https://cdn.test/a.png", alt: "Kapak" } });
    renderItem({ children: <CollectionField name="hero" /> });
    await waitFor(() => expect(claimed.has("news:q1")).toBe(true));
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://cdn.test/a.png");
  });

  it("gives the wrapper the picture's outer box so the layout matches a visitor's", async () => {
    mockFetch({ hero: { src: "https://cdn.test/a.png", alt: "Kapak" } });
    renderItem({
      children: <CollectionField name="hero" style={{ width: "100%", borderRadius: 8 }} />,
    });
    const img = await waitFor(() => screen.getByRole("img"));
    // Width places the picture, so it moves out to the positioned wrapper and
    // the image fills it; the radius only paints, so it stays put.
    expect(img.parentElement.style.width).toBe("100%");
    expect(img.style.width).toBe("100%");
    expect(img.parentElement.style.borderRadius).toBe("");
    expect(img.style.borderRadius).toBe("8px");
  });

  it("offers a drop-zone when the field is empty", async () => {
    mockFetch({ hero: null });
    renderItem({ children: <CollectionField name="hero" /> });
    await waitFor(() => expect(claimed.has("news:q1")).toBe(true));
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });
});

describe("driver election", () => {
  it("names one scope even when the record is rendered twice", async () => {
    mockFetch();
    claimed = new Map();
    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin getAccessToken={async () => "tok"}>
        <Probe />
        {[0, 1].map((i) => (
          <CollectionItem key={i} collection="news" slug="q1" fallback={<p>…</p>}>
            <CollectionField name="title" as="h1" />
          </CollectionItem>
        ))}
      </CmsProvider>,
    );
    await waitFor(() => expect(claimed.get("news:q1")).toBeTruthy());
    // Both rings render, but only one of them may PUT the shared draft.
    expect(document.querySelectorAll("h1[contenteditable]")).toHaveLength(2);
    expect(claimed.size).toBe(1);
  });
});

describe("misuse", () => {
  it("throws when rendered outside a CollectionItem", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <CmsProvider config={{ baseUrl: BASE }} isAdmin={false} getAccessToken={async () => "tok"}>
          <CollectionField name="title" />
        </CmsProvider>,
      ),
    ).toThrow(/inside a <CollectionItem>/);
    err.mockRestore();
  });
});
