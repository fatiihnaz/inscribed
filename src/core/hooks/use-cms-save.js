"use client";

/**
 * @file `useCmsSave()`: drawer-side save orchestration over `useCmsAdmin()`.
 * Builds the dirty-update set from the `drafts` Map plus server-side
 * `draftValue` overlays; `save()` PUTs them and clears matching local drafts,
 * `discard()` wipes local and backend drafts in one shot.
 *
 * Changes waiting in the page's other languages are listed too: drafts saved
 * on their own pages and translations typed here, which are drafts of theirs
 * as well. A language joins the set as a whole once it is included, by its
 * switch or while a translation written here waits in it, and never on its
 * own: a draft nobody chose to publish may be half done.
 *
 * Lives outside `admin/Drawer.jsx` so the drawer stays pure layout and the save
 * flow stays unit-testable.
 */

import { useCallback, useEffect, useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { deepEqual } from "../../shared/util/deep-equal.js";
import { globalsKey, localizePath, otherLocales, parseRouteKey, routeKey } from "../../shared/route.js";
import { mergeRouteBlocks } from "../blocks.js";
import { parseTranslationDraftKey, translationDraftKey } from "../../shared/state/draft-keys.js";
import { useCmsAdmin } from "./use-cms-admin.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { UpdateBlockItem } from "../../shared/contracts/schemas.js"
 */

/** @type {Map<string, import("../../shared/contracts/schemas.js").BlockResponse>} */
const EMPTY_BLOCKS = new Map();

/**
 * A change waiting in another language, on this page or in that language's
 * globals, in the shape the changes preview diffs.
 *
 * @typedef {Object} PendingDraft
 * @property {string} key       `translationDraftKey` of the row, which is also where a typed edit to it lives.
 * @property {string} locale
 * @property {string} blockPath
 * @property {string} blockType
 * @property {*} prev           What that language publishes.
 * @property {*} next           What it would publish instead.
 * @property {boolean} global
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
 * @property {PendingLanguage[]} pending
 *   Languages with changes waiting, in config order. Read from the store, so
 *   empty until something has read those languages in.
 * @property {(locale: string) => void} toggleLocale
 *   Include a pending language in the next save, or leave it out again.
 * @property {string[]} publishLocales
 *   The languages the next save writes to, the page's own first.
 * @property {boolean} isSaving
 * @property {Error|null} error
 * @property {() => Promise<void>} save     PUT all dirty updates, then clear matching local drafts.
 * @property {() => void} discard
 *   Wipe local edits, silently clean any server-side draft slots (no autosave
 *   pulse), and put the translations written here back where they were.
 */

/**
 * @param {string} key  A `translationDraftKey`.
 * @returns {string | null}
 */
function localeOfKey(key) {
  const parsed = parseTranslationDraftKey(key);
  return parsed ? parseRouteKey(parsed.routeKey).locale : null;
}

/**
 * @returns {UseCmsSaveResult}
 */
export function useCmsSave() {
  const {
    config, blocksStore, contentDraftsStore, uiStore, setActiveBlock,
    clearDraft, clearDrafts, discardServerDrafts, settleDraftWrites,
    translationDraftsStore, setTranslationDraft, clearTranslationDrafts, setIncludedLocales, setTranslations,
    setBlockConflicts,
  } = useCmsContext();
  // Whole-map subscriptions: this aggregates every dirty blockPath for the
  // drawer's live dirty count, so it re-renders on any draft change. Fine for
  // a single admin surface.
  const drafts = useStoreSelector(contentDraftsStore, (m) => m);
  const typed = useStoreSelector(translationDraftsStore, (m) => m);
  const included = useStoreSelector(uiStore, (s) => s.includedLocales);
  const written = useStoreSelector(uiStore, (s) => s.translations);
  const { slug, locale } = useCmsRoute();
  // The whole store, not this route's slice: another language's change is
  // versioned against that language's row, which lives under its own key.
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

  // A block is dirty when its effective value (local draft, else server-side
  // `draftValue`) differs from published `block.value`. Local edits win over
  // server drafts; `seen` dedupes when both layers exist for one block. The
  // other languages go by the same rule, with what was typed here as their
  // local edit.
  const { dirtyUpdates, keyOf, pending } = useMemo(() => {
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

    /** @type {Map<UpdateBlockItem, string>} */
    const keys = new Map();
    /** @type {PendingLanguage[]} */
    const waiting = [];
    for (const other of others) {
      const route = routeKey(slug, other);
      /** @type {PendingDraft[]} */
      const found = [];
      /** @type {number[]} */
      const versions = [];
      for (const [entry, global] of /** @type {const} */ ([
        [allBlocks.get(route), false],
        [allBlocks.get(globalsKey(other)), true],
      ])) {
        if (!entry) continue;
        const rows = [...entry.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const block of rows) {
          const key = translationDraftKey(route, block.blockPath);
          const next = typed.has(key) ? typed.get(key) : block.draftValue;
          if (next == null || deepEqual(next, block.value)) continue;
          found.push({
            key,
            locale: other,
            blockPath: block.blockPath,
            blockType: block.blockType,
            prev: block.value,
            next,
            global,
          });
          versions.push(block.version);
        }
      }
      if (found.length === 0) continue;
      const isIn = included.includes(other) || found.some((d) => written.get(d.key)?.pulls);
      if (isIn) {
        found.forEach((d, i) => {
          // Versioned against that language's row, not this route's: the two
          // copies of a block version independently.
          const update = { blockPath: d.blockPath, value: d.next, version: versions[i], locale: other };
          out.push(update);
          keys.set(update, d.key);
        });
      }
      waiting.push({
        locale: other,
        pathname: localizePath(slug, other, config),
        drafts: found,
        included: isIn,
      });
    }

    return { dirtyUpdates: out, keyOf: keys, pending: waiting };
  }, [drafts, blocks, typed, allBlocks, others, slug, config, included, written]);

  const publishLocales = useMemo(() => {
    const targets = new Set(dirtyUpdates.map((u) => u.locale ?? locale));
    return [locale, ...others].filter((l) => l != null && targets.has(l));
  }, [dirtyUpdates, locale, others]);

  // A language leaves the publish once nothing of it is waiting, so changes
  // that turn up there later are offered again rather than published unseen.
  useEffect(() => {
    setIncludedLocales((prev) => {
      const kept = prev.filter((l) => pending.some((p) => p.locale === l));
      return kept.length === prev.length ? prev : kept;
    });
  }, [pending, setIncludedLocales]);

  const toggleLocale = useCallback(
    /** @param {string} target */
    (target) => {
      const isIn = pending.find((p) => p.locale === target)?.included ?? false;
      if (!isIn) {
        setIncludedLocales((prev) => (prev.includes(target) ? prev : [...prev, target]));
        return;
      }
      setIncludedLocales((prev) => prev.filter((l) => l !== target));
      // Its translations written here stop pulling it in too. They stay its
      // drafts, as they would be if written on its own page, and undo still
      // reaches them.
      setTranslations((prev) => {
        let next = prev;
        for (const [key, entry] of prev) {
          if (!entry.pulls || localeOfKey(key) !== target) continue;
          if (next === prev) next = new Map(prev);
          next.set(key, { ...entry, pulls: false });
        }
        return next;
      });
    },
    [pending, setIncludedLocales, setTranslations],
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
    // user happens to type again.
    /** @param {UpdateBlockItem[]} landed */
    const standDown = (landed) => {
      /** @type {Map<string|null, string[]>} */
      const byLocale = new Map();
      for (const u of landed) byLocale.set(u.locale ?? null, [...(byLocale.get(u.locale ?? null) ?? []), u.blockPath]);
      // Every language's lane the same way: an autosave still in flight must
      // not land after the publish and put back what it just replaced.
      for (const [target, paths] of byLocale) settleDraftWrites(paths, target);
      for (const u of landed) if (u.locale == null) clearDraft(u.blockPath);
      // A translation typed since the click is newer than what went out, and
      // has its own write coming.
      const now = translationDraftsStore.get();
      clearTranslationDrafts(landed.flatMap((u) => {
        const key = keyOf.get(u);
        return key && now.has(key) && deepEqual(now.get(key), u.value) ? [key] : [];
      }));
      // Published, so there is nothing left to undo them back to.
      const settled = landed.flatMap((u) => keyOf.get(u) ?? []);
      setTranslations((prev) => {
        if (!settled.some((key) => prev.has(key))) return prev;
        const next = new Map(prev);
        for (const key of settled) next.delete(key);
        return next;
      });
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
  }, [dirtyUpdates, keyOf, savePage, clearDraft, clearTranslationDrafts, translationDraftsStore, setTranslations, setActiveBlock, settleDraftWrites, setBlockConflicts]);

  const discard = useCallback(() => {
    const translations = uiStore.get().translations;
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
    // Translations written here go back to what their languages said before,
    // the way the page's own edits go back to what is published. The drafts
    // other languages had of their own stay, only taken back out of this
    // publish: they are that language's work, not this page's.
    for (const [key, entry] of translations) setTranslationDraft(key, entry.before);
    setTranslations((prev) => (prev.size === 0 ? prev : new Map()));
    setIncludedLocales((prev) => (prev.length === 0 ? prev : []));
  }, [blocks, clearDrafts, discardServerDrafts, setIncludedLocales, setTranslations, setTranslationDraft, uiStore]);

  return {
    dirtyUpdates,
    dirtyCount: dirtyUpdates.length,
    pending,
    toggleLocale,
    publishLocales,
    isSaving,
    error,
    save,
    discard,
  };
}
