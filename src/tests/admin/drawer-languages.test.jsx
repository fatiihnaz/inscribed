// @vitest-environment jsdom
/**
 * The drawer's side of publishing another language's drafts: the lane above
 * the save bar that offers them, the save button that names every language it
 * will write, the preview that groups rows by language, and the wording when a
 * publish lands in one language and not the other.
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";

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
import { Drawer } from "../../admin/Drawer.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");
const CONFIG = { baseUrl: "https://api.test", locales: ["tr", "en"] };

/** Published rows and drafts per language, for one page. */
let rows;
/** Every `updateContent` call. */
let writes;
/** When set, the English publish fails once. */
let failEnglishOnce;

const blocksOf = (locale) => Object.entries(rows[locale]).map(([blockPath, r], i) => ({
  blockPath,
  blockType: "ShortText",
  value: r.value,
  draftValue: r.draft,
  version: r.version,
  sortOrder: i + 1,
  _slug: "/",
}));

const transport = {
  getContent: async (slug, opts) => (
    slug === "/" ? { slug, blocks: blocksOf(opts?.locale ?? "tr") } : { slug, blocks: [] }
  ),
  getMyCollections: async () => [],
  updateDraft: async () => {},
  deleteDraft: async () => {},
  updateContent: async (request, opts) => {
    const locale = opts?.locale ?? "tr";
    if (locale === "en" && failEnglishOnce) {
      failEnglishOnce = false;
      throw new Error("server did not answer");
    }
    writes.push({ slug: request.slug, locale });
    for (const item of request.blocks) {
      const r = rows[locale][item.blockPath];
      rows[locale][item.blockPath] = { value: item.value, version: r.version + 1, draft: null };
    }
    for (const r of Object.values(rows[locale])) r.draft = null;
    return { updated: request.blocks.length, unchanged: 0 };
  },
};

const ctx = /** @type {*} */ ({});

function Open() {
  const context = useCmsContext();
  ctx.setDraft = context.setDraft;
  React.useEffect(() => { context.setDrawerOpen(true); }, [context]);
  return null;
}

function renderDrawer() {
  return render(
    <CmsProvider
      config={CONFIG}
      transport={/** @type {*} */ (transport)}
      isAdmin
      initialSite={{ pages: [{ slug: "/", blocks: blocksOf("tr") }], global: [] }}
    >
      <Open />
      <Drawer />
    </CmsProvider>,
  );
}

const lane = () => screen.queryByRole("group", { name: t("elsewhere.title") });
const englishChip = (count = 2) => screen.getByRole("button", {
  name: t("elsewhere.include", { locale: "EN", count }),
});

beforeAll(() => {
  if (typeof globalThis.CSS === "undefined") {
    globalThis.CSS = /** @type {*} */ ({ escape: (s) => String(s).replace(/["\\]/g, "\\$&") });
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = /** @type {*} */ (
      class { observe() {} unobserve() {} disconnect() {} }
    );
  }
});

beforeEach(() => {
  rows = {
    tr: {
      "hero.title": { value: "Başlık", version: 3, draft: null },
      "hero.body": { value: "Gövde", version: 4, draft: null },
    },
    en: {
      "hero.title": { value: "Title", version: 5, draft: "Title, reworded" },
      "hero.body": { value: "Body", version: 9, draft: "Body, reworded" },
    },
  };
  writes = [];
  failEnglishOnce = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the lane above the save bar", () => {
  it("offers the other language's drafts without putting them in", async () => {
    renderDrawer();

    await waitFor(() => expect(lane()).toBeTruthy());
    expect(englishChip().getAttribute("aria-pressed")).toBe("false");
    // Nothing is in the next save yet, so there is nothing to press.
    expect(screen.queryByRole("button", { name: t("drawer.saveAll") })).toBeNull();
  });

  it("names every language the save will write once one is included", async () => {
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());
    act(() => { ctx.setDraft("hero.title", "Yeni başlık"); });

    fireEvent.click(englishChip());

    expect(englishChip().getAttribute("aria-pressed")).toBe("true");
    const save = await screen.findByRole("button", { name: t("status.saveLocales", { locales: "TR + EN" }) });
    // The changed-only filter counts the rows it can show, which are this
    // page's; the English drafts going out with the save have none here.
    expect(screen.getByRole("button", { name: t("drawer.changedOnly") }).textContent).toBe("1");
    fireEvent.click(save);

    await waitFor(() => expect(writes.map((w) => w.locale).sort()).toEqual(["en", "tr"]));
    await waitFor(() => expect(lane()).toBeNull());
  });

  it("says which language went live and offers to retry the other", async () => {
    failEnglishOnce = true;
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());
    act(() => { ctx.setDraft("hero.title", "Yeni başlık"); });
    fireEvent.click(englishChip());
    fireEvent.click(await screen.findByRole("button", { name: t("status.saveLocales", { locales: "TR + EN" }) }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(t("saveError.partial", {
      published: "TR",
      failed: "EN",
      reason: "server did not answer",
    }));
    const retry = await screen.findByRole("button", { name: t("status.retryLocales", { locales: "EN" }) });

    fireEvent.click(retry);
    await waitFor(() => expect(writes.map((w) => w.locale).sort()).toEqual(["en", "tr"]));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("the preview", () => {
  it("groups rows by language, and the other language's go in from its header", async () => {
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());
    act(() => { ctx.setDraft("hero.title", "Yeni başlık"); });

    fireEvent.click(await screen.findByRole("button", { name: t("status.preview") }));

    const turkish = await screen.findByRole("region", { name: "TR" });
    expect(within(turkish).getByText(t("changes.willPublish"))).toBeTruthy();
    const english = screen.getByRole("region", { name: "EN" });
    expect(within(english).getByText("/en")).toBeTruthy();
    expect(within(english).getAllByText(/^hero\./).map((n) => n.textContent)).toEqual(["hero.title", "hero.body"]);

    const include = within(english).getByRole("button", { name: t("elsewhere.include", { locale: "EN", count: 2 }) });
    expect(include.textContent).toBe(t("changes.include"));
    fireEvent.click(include);

    // The same switch as the lane's, under the same name: flipping one flips
    // the other.
    const switches = screen.getAllByRole("button", { name: t("elsewhere.include", { locale: "EN", count: 2 }) });
    expect(switches).toHaveLength(2);
    expect(switches.map((s) => s.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    expect(include.textContent).toBe(t("changes.included"));
  });
});

describe("a row's other languages", () => {
  it("open from the row on request, on that language's draft, and writing puts it in", async () => {
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());

    // Nothing was rewritten, so nothing offered itself: the row's button is the
    // way in.
    fireEvent.click(screen.getByRole("button", { name: t("translations.editOthersLabel", { path: "hero.title" }) }));
    const panel = await screen.findByRole("group", { name: t("translations.label") });
    const field = /** @type {HTMLInputElement} */ (within(panel).getByRole("textbox"));
    expect(field.value).toBe("Title, reworded");

    fireEvent.change(field, { target: { value: "Title, rewritten here" } });

    expect(englishChip().getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("button", { name: t("status.saveLocales", { locales: "EN" }) })).toBeTruthy();
  });

  it("shows the row's button once the row holds a change, without a hover", async () => {
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());
    const button = (path) => screen.getByRole("button", { name: t("translations.editOthersLabel", { path }) });
    expect(button("hero.title").classList.contains("is-shown")).toBe(false);

    act(() => { ctx.setDraft("hero.title", "Yeni başlık"); });

    await waitFor(() => expect(button("hero.title").classList.contains("is-shown")).toBe(true));
    expect(button("hero.body").classList.contains("is-shown")).toBe(false);
  });

  it("undoes the row in every language written from it", async () => {
    renderDrawer();
    await waitFor(() => expect(lane()).toBeTruthy());
    act(() => { ctx.setDraft("hero.title", "Yeni başlık"); });
    fireEvent.click(screen.getByRole("button", { name: t("translations.editOthersLabel", { path: "hero.title" }) }));
    const panel = await screen.findByRole("group", { name: t("translations.label") });
    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "Title, rewritten here" } });
    expect(await screen.findByRole("button", { name: t("status.saveLocales", { locales: "TR + EN" }) })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t("block.undoThis") }));

    // English is back to the draft it had before, and out of the publish; the
    // Turkish edit is gone, so the row has nothing left to undo.
    await waitFor(() => expect(within(panel).getByRole("textbox").value).toBe("Title, reworded"));
    await waitFor(() => expect(englishChip().getAttribute("aria-pressed")).toBe("false"));
    await waitFor(() => expect(screen.queryByRole("button", { name: t("block.undoThis") })).toBeNull());
  });
});
