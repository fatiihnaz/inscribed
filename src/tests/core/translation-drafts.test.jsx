// @vitest-environment jsdom
/**
 * A translation typed in the drawer is that language's draft.
 *
 * The claims under test: it autosaves on that language's own lane, the way an
 * edit on that language's page would, so it outlives a navigation; the panel
 * opens on whatever that language has waiting, and undo goes back there rather
 * than to the published text; writing one puts the language into the next
 * publish; and a write still on the wire when that language is published does
 * not put the old text back afterwards.
 *
 * The transport is a stand-in backend that keeps drafts the way the real one
 * does: per slug and language, overlaid on each write, cleared as a whole by a
 * publish there.
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
import { deepEqual } from "../../shared/util/deep-equal.js";
import { routeKey } from "../../shared/route.js";

const BODY = "hero.body";
const HOME_TR = routeKey("/", "tr");
const CONFIG = { baseUrl: "https://api.test", locales: ["tr", "en"] };

/** Published rows by slug, then language, then path. */
let rows;
/** Drafts by `${locale}|${slug}`, then path. */
let drafts;
/** Every draft write, in the order it was sent. */
let draftWrites;
/** Every draft DELETE. */
let deletes;
/** When set, the next draft write reaches the backend only once this resolves. */
let holdDraft;

/** @param {string} slug @param {string} locale */
const draftKey = (slug, locale) => `${locale}|${slug}`;

/** @param {string} slug @param {string} locale */
const blocksOf = (slug, locale) => Object.entries(rows[slug]?.[locale] ?? {}).map(([blockPath, r], i) => {
  const draft = drafts.get(draftKey(slug, locale))?.get(blockPath);
  return {
    blockPath,
    blockType: r.type,
    value: r.value,
    draftValue: draft === undefined || deepEqual(draft, r.value) ? null : draft,
    version: r.version,
    sortOrder: i + 1,
    ...(slug === "/" ? { _slug: "/" } : {}),
  };
});

const transport = {
  getContent: async (slug, opts) => ({ slug, blocks: blocksOf(slug, opts?.locale ?? "tr") }),
  getMyCollections: async () => [],
  updateDraft: async (request, opts) => {
    const locale = opts?.locale ?? "tr";
    draftWrites.push({ slug: request.slug, locale, blocks: request.blocks });
    const gate = holdDraft;
    holdDraft = null;
    if (gate) await gate.promise;
    const key = draftKey(request.slug, locale);
    const slot = drafts.get(key) ?? new Map();
    for (const item of request.blocks) slot.set(item.blockPath, item.value);
    drafts.set(key, slot);
  },
  deleteDraft: async (slug, opts) => {
    deletes.push({ slug, locale: opts?.locale ?? "tr" });
    drafts.delete(draftKey(slug, opts?.locale ?? "tr"));
  },
  updateContent: async (request, opts) => {
    const locale = opts?.locale ?? "tr";
    const table = rows[request.slug][locale];
    for (const item of request.blocks) {
      if (item.version !== table[item.blockPath].version) throw new Error("version mismatch");
    }
    for (const item of request.blocks) {
      const r = table[item.blockPath];
      table[item.blockPath] = { ...r, value: item.value, version: r.version + 1 };
    }
    drafts.delete(draftKey(request.slug, locale));
    return { updated: request.blocks.length, unchanged: 0 };
  },
};

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve: /** @type {() => void} */ (resolve) };
}

const probe = /** @type {*} */ ({});
const EMPTY = new Map();

function Probe() {
  const ctx = useCmsContext();
  useLanguageReads(true);
  Object.assign(probe, useCmsSave());
  const blocks = useStoreSelector(ctx.blocksStore, (s) => s.get(HOME_TR) ?? EMPTY);
  probe.targets = useCmsTranslations(
    blocks.get(BODY) ?? blocksOf("/", "tr")[0],
    { enabled: true },
  ).targets;
  return null;
}

const english = () => probe.targets[0];

let site;

/** @param {boolean} [withProbe]  False takes the card away with the provider left standing. */
function tree(withProbe = true) {
  return (
    <CmsProvider config={CONFIG} transport={/** @type {*} */ (transport)} isAdmin initialSite={site}>
      {withProbe ? <Probe /> : null}
    </CmsProvider>
  );
}

async function settle() {
  await act(async () => {});
  await act(async () => {});
}

/** Past the autosave debounce, with what it chains settled. */
async function tick(ms = 1000) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await settle();
}

async function mount() {
  let view;
  await act(async () => { view = render(tree()); });
  await settle();
  return view;
}

/** @param {string} value */
async function type(value) {
  act(() => { english().setValue(value); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  rows = {
    "/": {
      tr: { [BODY]: { type: "LongText", value: "Türkçe gövde", version: 4 } },
      en: { [BODY]: { type: "LongText", value: "English body", version: 9 } },
    },
  };
  drafts = new Map();
  draftWrites = [];
  deletes = [];
  holdDraft = null;
  site = { pages: [{ slug: "/", blocks: blocksOf("/", "tr") }], global: [] };
  pathname = "/";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a translation typed in the drawer", () => {
  it("is saved as that language's draft, on its own lane", async () => {
    await mount();
    await type("English body, rewritten");
    expect(english().saving).toBe(true);

    await tick();

    expect(draftWrites).toEqual([
      { slug: "/", locale: "en", blocks: [{ blockPath: BODY, value: "English body, rewritten", version: 9 }] },
    ]);
    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("English body, rewritten");
    // Mirrored into that language's entry, so the typed copy can go.
    expect(english()).toMatchObject({ saving: false, hasDraft: true, value: "English body, rewritten" });
  });

  it("is still saved when the editor leaves the page before the write goes out", async () => {
    const view = await mount();
    await type("English body, rewritten");

    pathname = "/hakkinda";
    await act(async () => { view.rerender(tree()); });
    await tick();

    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("English body, rewritten");
  });

  it("goes into the next publish, and stays a draft when taken back out", async () => {
    await mount();
    await type("English body, rewritten");

    expect(probe.pending[0].included).toBe(true);
    expect(probe.publishLocales).toEqual(["en"]);

    act(() => { probe.toggleLocale("en"); });
    await tick();

    expect(probe.dirtyUpdates).toEqual([]);
    expect(probe.pending[0]).toMatchObject({ included: false });
    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("English body, rewritten");
  });
});

describe("the other language's copy", () => {
  it("opens on that language's draft rather than its published text", async () => {
    drafts.set(draftKey("/", "en"), new Map([[BODY, "Half-written English"]]));
    await mount();

    expect(english()).toMatchObject({ value: "Half-written English", hasDraft: true, edited: false });
  });

  it("undoes back to that draft, not to the published text", async () => {
    drafts.set(draftKey("/", "en"), new Map([[BODY, "Half-written English"]]));
    await mount();
    await type("Something else entirely");
    expect(english().edited).toBe(true);

    act(() => { english().reset(); });
    await tick();

    // Resetting to the published text would have thrown away the draft that
    // was written on the English page before any of this.
    expect(english()).toMatchObject({ value: "Half-written English", edited: false });
    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("Half-written English");
  });

  it("keeps its undo when the card that wrote it is taken away and comes back", async () => {
    drafts.set(draftKey("/", "en"), new Map([[BODY, "Half-written English"]]));
    const view = await mount();
    await type("Something else entirely");

    // What switching the drawer's tab does to a row.
    await act(async () => { view.rerender(tree(false)); });
    await act(async () => { view.rerender(tree()); });
    await settle();
    expect(english().edited).toBe(true);

    act(() => { english().reset(); });
    await tick();
    expect(english()).toMatchObject({ value: "Half-written English", edited: false });
  });

  it("goes back to what it said before when every change on the page is discarded", async () => {
    drafts.set(draftKey("/", "en"), new Map([[BODY, "Half-written English"]]));
    await mount();
    await type("Something else entirely");
    await tick();
    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("Something else entirely");

    act(() => { probe.discard(); });
    await tick();

    // Not to the published text: the draft written on the English page before
    // any of this is English's own, and stays, out of the publish.
    expect(english()).toMatchObject({ value: "Half-written English", edited: false });
    expect(drafts.get(draftKey("/", "en")).get(BODY)).toBe("Half-written English");
    expect(probe.pending[0]).toMatchObject({ locale: "en", included: false });
  });

  it("takes the language back out of the publish when undone, drafts of its own and all", async () => {
    drafts.set(draftKey("/", "en"), new Map([[BODY, "Half-written English"]]));
    await mount();
    await type("Something else entirely");
    expect(probe.pending[0].included).toBe(true);

    act(() => { english().reset(); });
    await tick();

    // What waits in English now is only the draft written on the English page,
    // which nobody here chose to publish.
    expect(probe.pending[0]).toMatchObject({ locale: "en", included: false });
    expect(probe.dirtyUpdates).toEqual([]);
  });
});

describe("publishing a language while its draft write is on the wire", () => {
  it("does not let that write put the old text back", async () => {
    await mount();
    await type("First English");
    const gate = deferred();
    holdDraft = gate;
    await tick();
    // The write is out and has not reached the backend yet.
    expect(draftWrites).toHaveLength(1);
    expect(drafts.get(draftKey("/", "en"))).toBeUndefined();

    await act(async () => { await probe.save(); });
    expect(rows["/"].en[BODY]).toMatchObject({ value: "First English", version: 10 });

    await act(async () => { gate.resolve(); });
    await settle();

    // It landed after the publish and re-created the draft; the DELETE queued
    // behind it on the same lane cleared it again.
    expect(deletes).toContainEqual({ slug: "/", locale: "en" });
    expect(drafts.get(draftKey("/", "en"))).toBeUndefined();
  });
});
