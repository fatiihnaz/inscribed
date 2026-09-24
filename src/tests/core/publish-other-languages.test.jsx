// @vitest-environment jsdom
/**
 * Drafts waiting in the page's other languages, and the publish that can carry
 * them.
 *
 * An editor who worked on the English page and moved to the Turkish one left
 * English drafts behind. The claims under test: they are found and listed from
 * here, nothing of them is sent until their language is included, and once it
 * is they go out as that language's own writes, against its own versions, in
 * the same click as the page's. A publish that lands in one language and not
 * the other says so and retries only the one that did not.
 *
 * Hook-level, like `translation-publish.test.jsx`: the drawer only lays these
 * out, and everything that can corrupt content lives in the hooks.
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
/** Mutable so a test can navigate. */
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { useCmsSave } from "../../core/hooks/use-cms-save.js";
import { useCmsTranslations } from "../../core/hooks/use-cms-translations.js";
import { useLanguageReads } from "../../core/hooks/use-language-reads.js";
import { describeSaveError } from "../../admin/save-error.js";
import { routeKey } from "../../shared/route.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");

const BODY = "hero.body";
const TITLE = "hero.title";
const FOOTER = "footer.tagline";
const HOME_TR = routeKey("/", "tr");
const CONFIG = { baseUrl: "https://api.test", locales: ["tr", "en"] };

/**
 * @param {string} type @param {string} value @param {number} version
 * @param {string} [draft]
 */
const row = (type, value, version, draft) => ({ type, value, version, draft: draft ?? null });

/** Rows by slug, then language, then path, the way the backend keeps them. */
let table;
/** Every `updateContent` call. */
let writes;
/** Every `deleteDraft` call. */
let deletes;
/** `(slug, locale)` pairs handed to the revalidation callback. */
let revalidated;

/** @param {string} slug @param {string} locale */
const blocksOf = (slug, locale) => Object.entries(table[slug]?.[locale] ?? {}).map(
  ([blockPath, r], i) => ({
    blockPath,
    blockType: r.type,
    value: r.value,
    draftValue: r.draft,
    version: r.version,
    sortOrder: i + 1,
    ...(slug === "/" ? { _slug: "/" } : {}),
  }),
);

const transport = {
  getContent: async (slug, opts) => ({ slug, blocks: blocksOf(slug, opts?.locale ?? "tr") }),
  getMyCollections: async () => [],
  updateDraft: async () => {},
  deleteDraft: async (slug, opts) => {
    deletes.push({ slug, locale: opts?.locale ?? null });
  },
  // Mirrors the backend: every item is checked against its row's version, and
  // a publish then clears the editor's whole draft for that slug and language.
  updateContent: async (request, opts) => {
    const locale = opts?.locale ?? "tr";
    writes.push({ slug: request.slug, locale, blocks: request.blocks });
    const rows = table[request.slug][locale];
    for (const item of request.blocks) {
      if (item.version !== rows[item.blockPath].version) {
        throw new Error(`version mismatch for ${request.slug}/${locale}/${item.blockPath}`);
      }
    }
    for (const item of request.blocks) {
      const r = rows[item.blockPath];
      rows[item.blockPath] = { ...r, value: item.value, version: r.version + 1 };
    }
    for (const r of Object.values(rows)) r.draft = null;
    return { updated: request.blocks.length, unchanged: 0 };
  },
};

/** English fails once on the page slug, the way a dropped connection would. */
function flakyEnglishPage() {
  let failed = false;
  return {
    ...transport,
    updateContent: async (request, opts) => {
      if (opts?.locale === "en" && request.slug === "/" && !failed) {
        failed = true;
        throw new Error("EN yayınlanamadı");
      }
      return transport.updateContent(request, opts);
    },
  };
}

const probe = /** @type {*} */ ({});
const EMPTY = new Map();

function Probe() {
  const ctx = useCmsContext();
  probe.setDraft = ctx.setDraft;
  probe.triggerRefetch = ctx.triggerRefetch;
  useLanguageReads(true);
  Object.assign(probe, useCmsSave());
  const blocks = useStoreSelector(ctx.blocksStore, (s) => s.get(HOME_TR) ?? EMPTY);
  probe.bodyTargets = useCmsTranslations(
    blocks.get(BODY) ?? blocksOf("/", "tr")[0],
    { enabled: true },
  ).targets;
  return null;
}

async function settle() {
  await act(async () => {});
  await act(async () => {});
}

let site;

function tree(withTransport) {
  return (
    <CmsProvider
      config={CONFIG}
      transport={/** @type {*} */ (withTransport)}
      isAdmin
      initialSite={site}
      onAfterSave={(slug, locale) => { revalidated.push([slug, locale]); }}
    >
      <Probe />
    </CmsProvider>
  );
}

/** @param {*} [withTransport] */
async function mount(withTransport = transport) {
  let view;
  await act(async () => { view = render(tree(withTransport)); });
  await settle();
  return view;
}

beforeEach(() => {
  table = {
    "/": {
      tr: {
        [BODY]: row("LongText", "Türkçe gövde", 4),
        [TITLE]: row("ShortText", "Türkçe başlık", 3),
      },
      en: {
        [BODY]: row("LongText", "English body", 9, "English body, reworded"),
        [TITLE]: row("ShortText", "English title", 5, "English title, reworded"),
      },
    },
    __global: {
      tr: { [FOOTER]: row("ShortText", "Altbilgi", 2) },
      en: { [FOOTER]: row("ShortText", "Footer", 7, "Footer, reworded") },
    },
  };
  writes = [];
  deletes = [];
  revalidated = [];
  site = {
    pages: [{ slug: "/", blocks: blocksOf("/", "tr") }],
    global: [{ slug: "__global", blocks: blocksOf("__global", "tr") }],
  };
  pathname = "/";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("drafts waiting in another language", () => {
  it("are listed from here, page and globals, and sent nowhere yet", async () => {
    await mount();

    expect(probe.pending).toHaveLength(1);
    const [en] = probe.pending;
    expect(en).toMatchObject({ locale: "en", pathname: "/en", included: false });
    expect(en.drafts.map((d) => [d.blockPath, d.global])).toEqual([
      [BODY, false],
      [TITLE, false],
      [FOOTER, true],
    ]);
    expect(en.drafts[0]).toMatchObject({ prev: "English body", next: "English body, reworded" });

    // Nothing here says they are finished, so nothing goes out on its own.
    expect(probe.dirtyUpdates).toEqual([]);
    expect(probe.publishLocales).toEqual([]);
  });

  it("go out against that language's own versions once it is included", async () => {
    await mount();
    act(() => { probe.toggleLocale("en"); });
    await settle();

    expect(probe.pending[0].included).toBe(true);
    expect(probe.publishLocales).toEqual(["en"]);
    await act(async () => { await probe.save(); });

    expect(writes.map((w) => [w.slug, w.locale]).sort()).toEqual([["/", "en"], ["__global", "en"]]);
    // The stand-in throws on a version mismatch, so rows that moved on are the
    // proof each went out against its own version rather than the Turkish one.
    expect(table["/"].en[BODY]).toMatchObject({ value: "English body, reworded", version: 10 });
    expect(table.__global.en[FOOTER]).toMatchObject({ value: "Footer, reworded", version: 8 });
    expect(table["/"].tr[BODY].version).toBe(4);
    expect(revalidated.sort()).toEqual([["/", "en"], ["__global", "en"]]);
  });

  it("go out in the same click as the page's own edit, its language named first", async () => {
    await mount();
    act(() => { probe.setDraft(BODY, "Yeni Türkçe gövde"); });
    act(() => { probe.toggleLocale("en"); });
    await settle();

    expect(probe.publishLocales).toEqual(["tr", "en"]);
    await act(async () => { await probe.save(); });

    expect(writes.map((w) => [w.slug, w.locale]).sort()).toEqual([
      ["/", "en"],
      ["/", "tr"],
      ["__global", "en"],
    ]);
    expect(table["/"].tr[BODY]).toMatchObject({ value: "Yeni Türkçe gövde", version: 5 });
  });

  it("leave once published, and a draft written there later is offered, not sent", async () => {
    await mount();
    act(() => { probe.toggleLocale("en"); });
    await settle();
    await act(async () => { await probe.save(); });
    await settle();

    expect(probe.pending).toEqual([]);
    expect(probe.dirtyCount).toBe(0);

    table["/"].en[TITLE].draft = "A later English title";
    act(() => { probe.triggerRefetch(); });
    await settle();

    expect(probe.pending[0]).toMatchObject({ locale: "en", included: false });
    expect(probe.dirtyUpdates).toEqual([]);
  });

  it("give way to a translation staged here for the same block", async () => {
    await mount();
    act(() => { probe.bodyTargets[0].setValue("Translated beside the Turkish"); });
    await settle();

    // The staged text is what goes out for that block, so its draft is not
    // offered beside it as a second, different English body.
    expect(probe.pending[0].drafts.map((d) => d.blockPath)).toEqual([TITLE, FOOTER]);
    expect(probe.dirtyUpdates).toEqual([
      expect.objectContaining({ blockPath: BODY, locale: "en", value: "Translated beside the Turkish", version: 9 }),
    ]);
    expect(probe.publishLocales).toEqual(["en"]);
  });

  it("are taken back out by a discard, and left where they are", async () => {
    await mount();
    act(() => { probe.setDraft(BODY, "Yeni Türkçe gövde"); });
    act(() => { probe.toggleLocale("en"); });
    await settle();

    act(() => { probe.discard(); });
    await settle();

    expect(probe.pending[0].included).toBe(false);
    expect(probe.dirtyUpdates).toEqual([]);
    // They were written on the English page and are undone there, not here.
    expect(deletes.filter((d) => d.locale === "en")).toEqual([]);
    expect(table["/"].en[BODY].draft).toBe("English body, reworded");
  });

  it("are not included on arrival, even back on the page that included them", async () => {
    const view = await mount();
    act(() => { probe.toggleLocale("en"); });
    await settle();

    pathname = "/hakkinda";
    await act(async () => { view.rerender(tree(transport)); });
    await settle();
    pathname = "/";
    await act(async () => { view.rerender(tree(transport)); });
    await settle();

    expect(probe.pending[0].included).toBe(false);
    expect(probe.dirtyUpdates).toEqual([]);
  });
});

describe("a publish across languages that fails halfway", () => {
  it("names the language that went live and the one that did not", async () => {
    await mount(flakyEnglishPage());
    act(() => { probe.setDraft(BODY, "Yeni Türkçe gövde"); });
    act(() => { probe.toggleLocale("en"); });
    await settle();
    await act(async () => { await probe.save(); });
    await settle();

    // English landed on the global slug and failed on the page, so it is not
    // live as a whole.
    expect(probe.error.publishedLocales).toEqual(["tr"]);
    expect(probe.error.failedLocales).toEqual(["en"]);
    expect(describeSaveError(probe.error, t, 0, "tr").text).toBe(
      t("saveError.partial", { published: "TR", failed: "EN", reason: "EN yayınlanamadı" }),
    );
  });

  it("retries only what did not land", async () => {
    await mount(flakyEnglishPage());
    act(() => { probe.setDraft(BODY, "Yeni Türkçe gövde"); });
    act(() => { probe.toggleLocale("en"); });
    await settle();
    await act(async () => { await probe.save(); });
    await settle();

    expect(probe.publishLocales).toEqual(["en"]);
    expect(probe.dirtyUpdates.map((u) => [u.locale, u.blockPath])).toEqual([["en", BODY], ["en", TITLE]]);

    writes.length = 0;
    await act(async () => { await probe.save(); });
    await settle();

    expect(writes.map((w) => [w.slug, w.locale])).toEqual([["/", "en"]]);
    expect(table["/"].tr[BODY].version).toBe(5);
    expect(table["/"].en[BODY]).toMatchObject({ value: "English body, reworded", version: 10 });
    expect(probe.error).toBeNull();
    expect(probe.pending).toEqual([]);
  });
});
