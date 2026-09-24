"use client";

/**
 * @file `useCmsSave()`: drawer-side save orchestration over `useCmsAdmin()`.
 * Builds the dirty-update set from the `drafts` Map plus server-side
 * `draftValue` overlays; `save()` PUTs them and clears matching local drafts,
 * `discard()` wipes local and backend drafts in one shot.
 *
 * Translations staged from the drawer join that same set, tagged with the
 * language they belong to. They publish with the block they were written
 * beside, because a translation that could be left behind by its own source
 * edit is the state this feature exists to prevent.
 *
 * Drafts waiting in the page's other languages are listed too, but join the set
 * only once the editor includes their language: nothing on this page says they
 * are finished.
 *
 * Lives outside `admin/Drawer.jsx` so the drawer stays pure layout and the save
 * flow stays unit-testable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { deepEqual } from "../../shared/util/deep-equal.js";
import { globalsKey, localizePath, otherLocales, parseRouteKey, routeKey } from "../../shared/route.js";
import { mergeRouteBlocks, readBlock } from "../blocks.js";
import { parseTranslationDraftKey, translationDraftKey } from "../../shared/state/draft-keys.js";
import { useCmsAdmin } from "./use-cms-admin.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { UpdateBlockItem } from "../../shared/contracts/schemas.js"
 */

/** @type {Map<string, import("../../shared/contracts/schemas.js").BlockResponse>} */
const EMPTY_BLOCKS = new Map();

/** @type {string[]} */
const NO_LOCALES = [];

const NO_INCLUSION = { page: "", locales: NO_LOCALES };

/**
 * One staged translation, in the shape the changes preview diffs.
 *
 * @typedef {Object} TranslationPreview
 * @property {string} key
 * @property {string} locale
 * @property {string} blockPath
 * @property {string} blockType
 * @property {*} prev  What that language currently says.
 * @property {*} next  What the editor typed.
 */

/**
 * A draft saved in another language, on this page or in that language's
 * globals.
 *
 * @typedef {TranslationPreview & { global: boolean }} PendingDraft
 */

/**
 * @typedef {Object} PendingLanguage
 * @property {string} locale
 * @property {string} pathname   Where this page lives in that language.
 * @property {PendingDraft[]} drafts
 * @property {boolean} included  Whether the next save publishes them.
 */

/**
 * @typedef {Object} UseCmsSaveResult
 * @property {UpdateBlockItem[]} dirtyUpdates
 * @property {number} dirtyCount
 * @property {TranslationPreview[]} translationPreviews
 *   The subset of `dirtyUpdates` bound for another language, carrying both
 *   sides so the preview can diff them. Kept beside the count rather than
 *   derived from it: the drawer's "N unsaved changes" and the preview's own
 *   tally have to come from one pass, or they drift apart again.
 * @property {PendingLanguage[]} pending
 *   Languages with drafts waiting, in config order. Read from the store, so
 *   empty until something has read those languages in.
 * @property {(locale: string) => void} toggleLocale
 *   Include a pending language in the next save, or leave it out again.
 * @property {string[]} publishLocales
 *   The languages the next save writes to, the page's own first.
 * @property {boolean} isSaving
 * @property {Error|null} error
 * @property {() => Promise<void>} save     PUT all dirty updates, then clear matching local drafts.
 * @property {() => void} discard           Wipe local edits + silently clean any server-side draft slots (no autosave pulse).
 */

/**
 * @returns {UseCmsSaveResult}
 */
export function useCmsSave() {
  const {
    config, blocksStore, contentDraftsStore, setActiveBlock,
    clearDraft, clearDrafts, discardServerDrafts, settleDraftWrites,
    translationDraftsStore, clearTranslationDrafts,
    setBlockConflicts,
  } = useCmsContext();
  // Whole-map subscriptions: this aggregates every dirty blockPath for the
  // drawer's live dirty count, so it re-renders on any draft change. Fine for
  // a single admin surface.
  const drafts = useStoreSelector(contentDraftsStore, (m) => m);
  const translationDrafts = useStoreSelector(translationDraftsStore, (m) => m);
  const { slug, locale } = useCmsRoute();
  // The whole store, not this route's slice: a staged translation is versioned
  // against the language it targets, and that language's blocks live under
  // their own route key.
  const allBlocks = useStoreSelector(blocksStore, (s) => s);
  // The page's own blocks and the language's globals, as one map: a header is
  // as publishable from here as anything else on the page.
  const blocks = useMemo(
    () => mergeRouteBlocks(
      allBlocks.get(routeKey(slug, locale)) ?? EMPTY_BLOCKS,
      allBlocks.get(globalsKey(locale)) ?? EMPTY_BLOCKS,
    ),
    [allBlocks, slug, locale],
  );
  const others = useMemo(() => otherLocales(config, locale), [config, locale]);
  const { savePage, isSaving, error, clearError } = useCmsAdmin();

  // Which pending languages the editor has put in. Tied to the page it was
  // chosen on: including English here says nothing about the next page's.
  const page = routeKey(slug, locale);
  const [inclusion, setInclusion] = useState(NO_INCLUSION);
  const included = inclusion.page === page ? inclusion.locales : NO_LOCALES;

  // A block is dirty when its effective value (local draft, else server-side
  // `draftValue`) differs from published `block.value`. Local edits win over
  // server drafts; `seen` dedupes when both layers exist for one block.
  const { dirtyUpdates, translationKeyOf, translationPreviews, pending } = useMemo(() => {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {UpdateBlockItem[]} */
    const out = [];
    for (const [blockPath, value] of drafts) {
      const block = blocks.get(blockPath);
      if (!block) continue;
      if (deepEqual(value, block.value)) continue;
      out.push({ blockPath, value, version: block.version });
      seen.add(blockPath);
    }
    for (const block of blocks.values()) {
      if (block.draftValue == null) continue;
      if (seen.has(block.blockPath)) continue;
      // Backend auto-clean already filters draft===published; defensive
      // against a stale optimistic update reaching us first.
      if (deepEqual(block.draftValue, block.value)) continue;
      out.push({
        blockPath: block.blockPath,
        value: block.draftValue,
        version: block.version,
      });
    }

    // Staged translations. Each carries the version of the row it will
    // overwrite, read from the language it targets rather than from this route:
    // the two copies of a block version independently.
    /** @type {Map<UpdateBlockItem, string>} */
    const keyOf = new Map();
    /** @type {TranslationPreview[]} */
    const previews = [];
    for (const [key, value] of translationDrafts) {
      const parsed = parseTranslationDraftKey(key);
      if (!parsed) continue;
      const targetLocale = parseRouteKey(parsed.routeKey).locale;
      // A staged edit for the language already on screen would be published
      // twice, and one for no language at all cannot be addressed.
      if (!targetLocale || targetLocale === locale) continue;
      const target = readBlock(
        allBlocks, parsed.routeKey, globalsKey(targetLocale), parsed.blockPath,
      );
      if (!target) continue;
      if (deepEqual(value, target.value)) continue;
      const update = {
        blockPath: parsed.blockPath,
        value,
        version: target.version,
        locale: targetLocale,
      };
      out.push(update);
      keyOf.set(update, key);
      previews.push({
        key,
        locale: targetLocale,
        blockPath: parsed.blockPath,
        blockType: target.blockType,
        prev: target.value,
        next: value,
      });
    }
    previews.sort((a, b) => a.blockPath.localeCompare(b.blockPath)
      || a.locale.localeCompare(b.locale));

    /** @type {PendingLanguage[]} */
    const waiting = [];
    for (const other of others) {
      const route = routeKey(slug, other);
      /** @type {PendingDraft[]} */
      const found = [];
      for (const [entry, global] of /** @type {const} */ ([
        [allBlocks.get(route), false],
        [allBlocks.get(globalsKey(other)), true],
      ])) {
        if (!entry) continue;
        const rows = [...entry.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const block of rows) {
          if (block.draftValue == null || deepEqual(block.draftValue, block.value)) continue;
          const key = translationDraftKey(route, block.blockPath);
          // Written over by a translation staged here, which is what goes out.
          if (translationDrafts.has(key)) continue;
          found.push({
            key,
            locale: other,
            blockPath: block.blockPath,
            blockType: block.blockType,
            prev: block.value,
            next: block.draftValue,
            global,
          });
          if (included.includes(other)) {
            out.push({
              blockPath: block.blockPath,
              value: block.draftValue,
              version: block.version,
              locale: other,
            });
          }
        }
      }
      if (found.length === 0) continue;
      waiting.push({
        locale: other,
        pathname: localizePath(slug, other, config),
        drafts: found,
        included: included.includes(other),
      });
    }

    return {
      dirtyUpdates: out,
      translationKeyOf: keyOf,
      translationPreviews: previews,
      pending: waiting,
    };
  }, [drafts, blocks, translationDrafts, allBlocks, locale, others, slug, config, included]);

  const publishLocales = useMemo(() => {
    const targets = new Set(dirtyUpdates.map((u) => u.locale ?? locale));
    return [locale, ...others].filter((l) => l != null && targets.has(l));
  }, [dirtyUpdates, locale, others]);

  // A language leaves the publish once nothing of it is waiting, so drafts that
  // turn up there later are offered again rather than published unseen. Leaving
  // the page drops the choice too, the way it drops the page's own drafts.
  useEffect(() => {
    setInclusion((prev) => {
      if (prev.page !== page) return prev === NO_INCLUSION ? prev : NO_INCLUSION;
      const kept = prev.locales.filter((l) => pending.some((p) => p.locale === l));
      return kept.length === prev.locales.length ? prev : { page, locales: kept };
    });
  }, [pending, page]);

  const toggleLocale = useCallback(
    /** @param {string} target */
    (target) => {
      setInclusion((prev) => {
        const current = prev.page === page ? prev.locales : NO_LOCALES;
        return {
          page,
          locales: current.includes(target)
            ? current.filter((l) => l !== target)
            : [...current, target],
        };
      });
    },
    [page],
  );

  // A failure only describes pending edits, so once none are left it has
  // nothing left to be about: resolving a conflict by taking the other side
  // drains the last of them, and the banner has to go with it. Left alone it
  // would also still be sitting there when the next edit begins.
  useEffect(() => {
    if (error && dirtyUpdates.length === 0) clearError();
  }, [error, dirtyUpdates.length, clearError]);

  const save = useCallback(async () => {
    if (dirtyUpdates.length === 0) return;
    // Only for what landed: a failed write keeps its draft for the retry, and
    // standing its lane down would mean nothing reaches the server until the
    // user happens to type again. Another language's drafts need nothing here:
    // the publish cleared them on the backend, and the refetch it triggers
    // reads that back.
    /** @param {UpdateBlockItem[]} landed */
    const standDown = (landed) => {
      const own = landed.filter((u) => u.locale == null);
      // Only this route's own writes: the draft lanes being stood down belong
      // to the language on screen, and no translation was ever drafted into one.
      settleDraftWrites(own.map((u) => u.blockPath));
      for (const u of own) clearDraft(u.blockPath);
      clearTranslationDrafts(landed.flatMap((u) => translationKeyOf.get(u) ?? []));
    };
    try {
      await savePage(dirtyUpdates);
      standDown(dirtyUpdates);
      // Whatever a previous attempt clashed on is settled now.
      setBlockConflicts([]);
      setActiveBlock(null);
    } catch (err) {
      // Error surfaced via useCmsAdmin().error. What landed is live, so its
      // drafts go now; left in place, the retry would resend them at a version
      // the backend has already moved past.
      const landed = /** @type {{ landed?: UpdateBlockItem[] }} */ (err)?.landed;
      if (landed?.length) standDown(landed);
    }
  }, [dirtyUpdates, translationKeyOf, savePage, clearDraft, clearTranslationDrafts, setActiveBlock, settleDraftWrites, setBlockConflicts]);

  const discard = useCallback(() => {
    // Local edits first; emptying the map also cancels any pending autosave
    // debounce (the effect depends on `drafts`).
    clearDrafts();
    // Server cleanup via the provider's silent path: null `draftValue`
    // optimistically (dirty count updates at once) and fire the PUTs without
    // flashing the autosave status, so the pill doesn't say "Taslak kayıtlı"
    // for a request that just deleted that draft.
    /** @type {string[]} */
    const pathsWithServerDraft = [];
    for (const block of blocks.values()) {
      if (block.draftValue != null) pathsWithServerDraft.push(block.blockPath);
    }
    discardServerDrafts(pathsWithServerDraft);
    // The other languages' drafts are left where they are, only taken back out
    // of this publish: they were written on their own pages, not undone here.
    setInclusion(NO_INCLUSION);
  }, [blocks, clearDrafts, discardServerDrafts]);

  return {
    dirtyUpdates,
    dirtyCount: dirtyUpdates.length,
    translationPreviews,
    pending,
    toggleLocale,
    publishLocales,
    isSaving,
    error,
    save,
    discard,
  };
}
