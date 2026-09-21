// @vitest-environment jsdom
/**
 * Translations staged from the drawer, and the publish that carries them.
 *
 * The claim under test is that one click writes every language: the block on
 * screen and each translation typed beside it go out as one PUT per target,
 * each addressed with its own `locale` and versioned against its own row. The
 * failure this guards is the quiet one, where a translation is accepted by the
 * UI and then published against the wrong language's version or not at all.
 *
 * Hook-level rather than through the drawer: `TranslationPrompt` decides *when*
 * to offer (covered by `translation-scope.test.js`), while everything that can
 * corrupt content lives in the fetch/stage/publish path these hooks own.
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
/** Mutable so a test can switch language the way the locale switcher does. */
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
import { routeKey } from "../../shared/route.js";

const PATH = "hero.body";
const GLOBAL_PATH = "footer.tagline";
/** Where the Turkish home page's blocks live in the store. */
const HOME_TR = routeKey("/", "tr");

/** Published rows, per language. Versions move independently on purpose. */
let rows;
/** The same, for a block that lives on the global slug rather than the page. */
let globalRows;
/** Every `getContent` call, so "one request per language" is checkable. */
let reads;
/** Every `updateContent` call, in flight order. */
let writes;
/** `(slug, locale)` pairs handed to the revalidation callback. */
let revalidated;

const seedBlock = (locale) => ({
  blockPath: PATH,
  blockType: "LongText",
  value: rows[locale].value,
  draftValue: null,
  version: rows[locale].version,
  sortOrder: 1,
  _slug: "/",
});

const seedGlobalBlock = (locale) => ({
  blockPath: GLOBAL_PATH,
  blockType: "ShortText",
  value: globalRows[locale].value,
  draftValue: null,
  version: globalRows[locale].version,
  sortOrder: 2,
});

/** Rows for one slug, by language. `__global` has its own set. */
const rowsFor = (slug) => (slug === "__global" ? globalRows : rows);

/** When set, reads never resolve, so a test can inspect the waiting state. */
let holdReads = false;

const transport = {
  getContent: async (slug, opts) => {
    const locale = opts?.locale ?? "tr";
    reads.push({ slug, locale: opts?.locale ?? null });
    if (holdReads) await new Promise(() => {});
    if (slug === "__global") return { slug, locale: opts?.locale, blocks: [seedGlobalBlock(locale)] };
    if (slug !== "/") return { slug, blocks: [] };
    return { slug, locale: opts?.locale, blocks: [seedBlock(locale)] };
  },
  getMyCollections: async () => [],
  updateDraft: async () => {},
  deleteDraft: async () => {},
  updateContent: async (request, opts) => {
    const locale = opts?.locale ?? null;
    writes.push({ slug: request.slug, locale, blocks: request.blocks });
    const table = rowsFor(request.slug);
    for (const item of request.blocks) {
      const row = table[locale];
      if (item.version !== row.version) {
        throw new Error(
          `version mismatch for ${request.slug}/${locale}: sent ${item.version}, have ${row.version}`,
        );
      }
      table[locale] = { value: item.value, version: row.version + 1 };
    }
    return { updated: request.blocks.length, unchanged: 0 };
  },
};

const probe = /** @type {*} */ ({});

function Probe() {
  const ctx = useCmsContext();
  const blocks = useStoreSelector(ctx.blocksStore, (s) => s.get(HOME_TR) ?? EMPTY);
  const block = blocks.get(PATH) ?? seedBlock("tr");

  probe.setDraft = ctx.setDraft;
  probe.blocksStore = ctx.blocksStore;
  const translations = useCmsTranslations(block, { enabled: true });
  probe.targets = translations.targets;
  probe.isReady = translations.isReady;
  probe.globalTargets = useCmsTranslations(
    blocks.get(GLOBAL_PATH) ?? seedGlobalBlock("tr"),
    { enabled: true },
  ).targets;

  const { save, dirtyUpdates, dirtyCount, translationPreviews } = useCmsSave();
  probe.save = save;
  probe.dirtyUpdates = dirtyUpdates;
  probe.dirtyCount = dirtyCount;
  probe.translationPreviews = translationPreviews;
  return null;
}

/**
 * A card that starts asking for translations only once it is mounted, which is
 * what a second block being rewritten a moment later looks like.
 */
function LateCard() {
  const ctx = useCmsContext();
  const blocks = useStoreSelector(ctx.blocksStore, (s) => s.get(HOME_TR) ?? EMPTY);
  useCmsTranslations(blocks.get(PATH) ?? seedBlock("tr"), { enabled: true });
  return null;
}

const EMPTY = new Map();

async function settle() {
  await act(async () => {});
}

/** Hoisted so a rerender doesn't re-seed the provider on prop identity alone. */
let site;

function tree(children, withTransport = transport) {
  return (
    <CmsProvider
      config={CONFIG}
      transport={/** @type {*} */ (withTransport)}
      isAdmin
      initialSite={site}
      onAfterSave={(slug, locale) => { revalidated.push([slug, locale]); }}
    >
      {children}
    </CmsProvider>
  );
}

const CONFIG = { baseUrl: "https://api.test", locales: ["tr", "en"] };

async function mount() {
  return mountWith(transport);
}

/** @param {*} withTransport */
async function mountWith(withTransport) {
  let view;
  await act(async () => { view = render(tree(<Probe />, withTransport)); });
  await settle();
  return view;
}

beforeEach(() => {
  rows = {
    tr: { value: "Türkçe gövde metni", version: 4 },
    en: { value: "English body copy", version: 9 },
  };
  globalRows = {
    tr: { value: "Altbilgi sloganı", version: 2 },
    en: { value: "Footer tagline", version: 7 },
  };
  reads = [];
  writes = [];
  revalidated = [];
  site = {
    pages: [{ slug: "/", blocks: [seedBlock("tr")] }],
    global: [{ slug: "__global", blocks: [seedGlobalBlock("tr")] }],
  };
  pathname = "/";
  holdReads = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staging a translation", () => {
  it("reads the other language off its own route, and only that language", async () => {
    await mount();

    const target = probe.targets.find((t) => t.locale === "en");
    expect(target).toBeTruthy();
    // The route the English copy actually lives at, so the fetch doubles as a
    // warm cache for navigating there rather than filling a private one.
    expect(target.pathname).toBe("/en");
    expect(target.value).toBe("English body copy");

    // Turkish is the language on screen; offering to translate into it would be
    // offering to retype what the editor just wrote.
    expect(probe.targets.map((t) => t.locale)).toEqual(["en"]);
    expect(reads.some((r) => r.locale === "en")).toBe(true);
  });

  it("pulls each language once for the whole page, not once per block", async () => {
    const view = await mount();
    reads.length = 0;

    // A second block rewritten a moment later wants the same page in the same
    // language. Merging only concurrent requests does not catch this: the first
    // card's fetch has already landed, so a per-card record would pull `/en`
    // again for a page the store is holding.
    await act(async () => { view.rerender(tree(<><Probe /><LateCard /></>)); });
    await settle();

    expect(reads.filter((r) => r.locale === "en")).toEqual([]);
  });

  it("pulls again after a publish, because the other language's version moved", async () => {
    await mount();
    reads.length = 0;

    act(() => { probe.setDraft(PATH, "Yeni Türkçe gövde"); });
    await settle();
    await act(async () => { await probe.save(); });
    await settle();

    // Reusing the pre-publish rows would send a version the backend has moved
    // past, which is a 409 on a translation the editor never got to see.
    expect(reads.some((r) => r.locale === "en")).toBe(true);
  });

  it("reads the other language in one request, globals and all", async () => {
    // The fallback above asks for the page and the global slug separately. A
    // backend that answers the whole site gives both in one, and every global
    // slug it recognises rather than only the configured one.
    const siteReads = [];
    const wholeSiteTransport = {
      ...transport,
      getSiteContent: async (opts) => {
        siteReads.push(opts?.locale ?? null);
        return {
          pages: [{ slug: "/", blocks: [seedBlock(opts?.locale ?? "tr")] }],
          global: [{ slug: "__global", blocks: [seedGlobalBlock(opts?.locale ?? "tr")] }],
        };
      },
    };
    const view = await mountWith(wholeSiteTransport);

    // Once for the editor's own language, once for the one being translated
    // into. Nothing went through the per-route read.
    expect(siteReads).toEqual(["tr", "en"]);
    expect(reads).toEqual([]);
    expect(probe.targets[0].block.value).toBe(rows.en.value);
    expect(probe.globalTargets[0].block.value).toBe(globalRows.en.value);

    // A read that covered the language covers every page of it, so opening a
    // translation somewhere else is free.
    pathname = "/hakkinda";
    await act(async () => { view.rerender(tree(<Probe />, wholeSiteTransport)); });
    await settle();
    expect(siteReads).toEqual(["tr", "en"]);
  });

  it("counts a staged translation as an unpublished change", async () => {
    await mount();
    expect(probe.dirtyCount).toBe(0);

    act(() => { probe.targets[0].setValue("Yepyeni İngilizce gövde"); });
    await settle();

    expect(probe.dirtyCount).toBe(1);
    expect(probe.dirtyUpdates[0]).toMatchObject({
      blockPath: PATH,
      locale: "en",
      // The English row's version, not the Turkish one's. Sending 4 here would
      // be a 409 at best and an overwrite of someone else's edit at worst.
      version: 9,
    });
  });

  it("hands the preview both sides, so the review covers what Kaydet sends", async () => {
    await mount();
    act(() => { probe.targets[0].setValue("Yepyeni İngilizce gövde"); });
    await settle();

    // One pass builds the count and the preview, because the drawer's status
    // bar and its Önizle tally reading different sources is how they drifted
    // apart the last time.
    expect(probe.translationPreviews).toHaveLength(probe.dirtyCount);
    expect(probe.translationPreviews[0]).toMatchObject({
      locale: "en",
      blockPath: PATH,
      blockType: "LongText",
      prev: "English body copy",
      next: "Yepyeni İngilizce gövde",
    });
  });

  it("ignores a staged value identical to what that language already says", async () => {
    await mount();
    act(() => { probe.targets[0].setValue("English body copy"); });
    await settle();
    expect(probe.dirtyCount).toBe(0);
  });
});

describe("publishing", () => {
  it("sends one PUT per language, each addressed and versioned as its own", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, "Yeni Türkçe gövde"); });
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    await settle();

    await act(async () => { await probe.save(); });

    expect(writes).toHaveLength(2);
    const byLocale = Object.fromEntries(writes.map((w) => [w.locale, w]));
    expect(byLocale.tr.blocks[0].value).toBe("Yeni Türkçe gövde");
    expect(byLocale.en.blocks[0].value).toBe("Brand new English body");

    // Both landed: the stand-in throws on a version mismatch, so reaching here
    // with both rows advanced is the assertion that each was versioned right.
    expect(rows.tr).toEqual({ value: "Yeni Türkçe gövde", version: 5 });
    expect(rows.en).toEqual({ value: "Brand new English body", version: 10 });
  });

  it("keeps `locale` out of the request body", async () => {
    await mount();
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    await settle();
    await act(async () => { await probe.save(); });

    // It addresses the request, so it belongs in the query string. Leaving it
    // on the item would have the backend read a language off a value.
    for (const write of writes) {
      for (const item of write.blocks) {
        expect(item).not.toHaveProperty("locale");
        expect(Object.keys(item).sort()).toEqual(["blockPath", "value", "version"]);
      }
    }
  });

  it("revalidates each language's cache separately", async () => {
    await mount();
    act(() => { probe.setDraft(PATH, "Yeni Türkçe gövde"); });
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    await settle();
    await act(async () => { await probe.save(); });

    // Two tags, not one: publishing the English copy must not rebuild the
    // Turkish page, and vice versa.
    expect(revalidated.sort()).toEqual([["/", "en"], ["/", "tr"]]);
  });

  it("sends a global block's translation to the global slug, not the page", async () => {
    await mount();

    const target = probe.globalTargets[0];
    // The route it is offered from, because that is where the merged fetch put
    // it. `__global` is a slug, not a page, so a pathname built from it would
    // be one no locale could be read back out of, and the staged edit would be
    // dropped at publish time without a word.
    expect(target.pathname).toBe("/en");
    expect(target.value).toBe("Footer tagline");

    act(() => { target.setValue("Brand new footer tagline"); });
    await settle();
    await act(async () => { await probe.save(); });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ slug: "__global", locale: "en" });
    expect(globalRows.en).toEqual({ value: "Brand new footer tagline", version: 8 });
    expect(globalRows.tr.version).toBe(2);
  });

  it("splits one batch across page, global and language", async () => {
    await mount();

    act(() => { probe.setDraft(PATH, "Yeni Türkçe gövde"); });
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    act(() => { probe.globalTargets[0].setValue("Brand new footer tagline"); });
    await settle();

    await act(async () => { await probe.save(); });

    // Three endpoints, three PUTs: (/, tr), (/, en), (__global, en).
    expect(writes.map((w) => [w.slug, w.locale]).sort()).toEqual([
      ["/", "en"],
      ["/", "tr"],
      ["__global", "en"],
    ]);
    expect(revalidated.sort()).toEqual([["/", "en"], ["/", "tr"], ["__global", "en"]]);
  });

  it("publishes a translation on its own, with no edit to the source", async () => {
    await mount();
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    await settle();
    await act(async () => { await probe.save(); });

    expect(writes).toHaveLength(1);
    expect(writes[0].locale).toBe("en");
    expect(rows.tr.version).toBe(4);
  });

  it("drops the staged translation once it has landed", async () => {
    await mount();
    act(() => { probe.targets[0].setValue("Brand new English body"); });
    await settle();
    await act(async () => { await probe.save(); });
    await settle();

    // Left behind, it would be re-sent by the next publish at a version the
    // backend has already moved past.
    expect(probe.dirtyCount).toBe(0);
    expect(probe.targets[0].hasDraft).toBe(false);
  });
});

describe("waiting on the other language", () => {
  it("is not ready until every target has been answered for", async () => {
    holdReads = true;
    await act(async () => { render(tree(<Probe />)); });
    await settle();

    // A surface that opens on `enabled` alone opens here, with rows holding
    // nothing, and has to grow again when the values land. That second step is
    // the twitch.
    expect(probe.isReady).toBe(false);
    expect(probe.targets[0].block).toBeNull();
  });

  it("is ready once a language answers, even with nothing to give", async () => {
    await mount();
    expect(probe.isReady).toBe(true);
  });
});

describe("without locales configured", () => {
  it("offers nothing and fetches nothing extra", async () => {
    await act(async () => {
      render(
        <CmsProvider
          config={{ baseUrl: "https://api.test" }}
          transport={/** @type {*} */ (transport)}
          isAdmin
          initialSite={{ pages: [{ slug: "/", blocks: [seedBlock("tr")] }], global: [] }}
        >
          <Probe />
        </CmsProvider>,
      );
    });
    await settle();

    expect(probe.targets).toEqual([]);
    // Every read is the single-language shape the pre-i18n wire had.
    expect(reads.every((r) => r.locale == null)).toBe(true);
  });
});
