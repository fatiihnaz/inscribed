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
 * Lives outside `admin/Drawer.jsx` so the drawer stays pure layout and the save
 * flow stays unit-testable.
 */

import { useCallback, useEffect, useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { deepEqual } from "../../shared/util/deep-equal.js";
import { resolveCmsRoute } from "../../shared/route.js";
import { parseTranslationDraftKey } from "../../shared/state/draft-keys.js";
import { useCmsAdmin } from "./use-cms-admin.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { UpdateBlockItem } from "../../shared/contracts/schemas.js"
 */

/** @type {Map<string, import("../../shared/contracts/schemas.js").BlockResponse>} */
const EMPTY_BLOCKS = new Map();

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
 * @typedef {Object} UseCmsSaveResult
 * @property {UpdateBlockItem[]} dirtyUpdates
 * @property {number} dirtyCount
 * @property {TranslationPreview[]} translationPreviews
 *   The subset of `dirtyUpdates` bound for another language, carrying both
 *   sides so the preview can diff them. Kept beside the count rather than
 *   derived from it: the drawer's "N unsaved changes" and the preview's own
 *   tally have to come from one pass, or they drift apart again.
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
  const { pathname, locale } = useCmsRoute();
  // The whole store, not this route's slice: a staged translation is versioned
  // against the language it targets, and that language's blocks live under
  // their own route key.
  const allBlocks = useStoreSelector(blocksStore, (s) => s);
  const blocks = allBlocks.get(pathname) ?? EMPTY_BLOCKS;
  const { savePage, isSaving, error, clearError } = useCmsAdmin();

  // A block is dirty when its effective value (local draft, else server-side
  // `draftValue`) differs from published `block.value`. Local edits win over
  // server drafts; `seen` dedupes when both layers exist for one block.
  const { dirtyUpdates, translationKeys, translationPreviews } = useMemo(() => {
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
    /** @type {string[]} */
    const keys = [];
    /** @type {TranslationPreview[]} */
    const previews = [];
    for (const [key, value] of translationDrafts) {
      const parsed = parseTranslationDraftKey(key);
      if (!parsed) continue;
      const targetLocale = resolveCmsRoute(parsed.pathname, config).locale;
      // A staged edit for the language already on screen would be published
      // twice, and one for no language at all cannot be addressed.
      if (!targetLocale || targetLocale === locale) continue;
      const target = (allBlocks.get(parsed.pathname) ?? EMPTY_BLOCKS).get(parsed.blockPath);
      if (!target) continue;
      if (deepEqual(value, target.value)) continue;
      out.push({
        blockPath: parsed.blockPath,
        value,
        version: target.version,
        locale: targetLocale,
      });
      keys.push(key);
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

    return { dirtyUpdates: out, translationKeys: keys, translationPreviews: previews };
  }, [drafts, blocks, translationDrafts, allBlocks, config, locale]);

  // A failure only describes pending edits, so once none are left it has
  // nothing left to be about: resolving a conflict by taking the other side
  // drains the last of them, and the banner has to go with it. Left alone it
  // would also still be sitting there when the next edit begins.
  useEffect(() => {
    if (error && dirtyUpdates.length === 0) clearError();
  }, [error, dirtyUpdates.length, clearError]);

  const save = useCallback(async () => {
    if (dirtyUpdates.length === 0) return;
    try {
      await savePage(dirtyUpdates);
      // Only on success: a failed publish leaves the drafts for a retry, and
      // standing the lane down would mean nothing reaches the server until the
      // user happens to type again.
      const own = dirtyUpdates.filter((u) => u.locale == null);
      // Only this route's own writes: the draft lanes being stood down belong
      // to the language on screen, and no translation was ever drafted into one.
      settleDraftWrites(own.map((u) => u.blockPath));
      for (const u of own) clearDraft(u.blockPath);
      clearTranslationDrafts(translationKeys);
      // Whatever a previous attempt clashed on is settled now.
      setBlockConflicts([]);
      setActiveBlock(null);
    } catch {
      // Error surfaced via useCmsAdmin().error; keep drafts so the user can retry.
    }
  }, [dirtyUpdates, translationKeys, savePage, clearDraft, clearTranslationDrafts, setActiveBlock, settleDraftWrites, setBlockConflicts]);

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
  }, [blocks, clearDrafts, discardServerDrafts]);

  return {
    dirtyUpdates,
    dirtyCount: dirtyUpdates.length,
    translationPreviews,
    isSaving,
    error,
    save,
    discard,
  };
}