"use client";

/**
 * @file `useCmsSave()`: drawer-side save orchestration over `useCmsAdmin()`.
 * Builds the dirty-update set from the `drafts` Map plus server-side
 * `draftValue` overlays; `save()` PUTs them and clears matching local drafts,
 * `discard()` wipes local and backend drafts in one shot.
 *
 * Lives outside `admin/Drawer.jsx` so the drawer stays pure layout and the save
 * flow stays unit-testable.
 */

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { deepEqual } from "../../shared/util/deep-equal.js";
import { useCmsAdmin } from "./use-cms-admin.js";

/**
 * @import { UpdateBlockItem } from "../../shared/contracts/schemas.js"
 */

/** @type {Map<string, import("../../shared/contracts/schemas.js").BlockResponse>} */
const EMPTY_BLOCKS = new Map();

/**
 * @typedef {Object} UseCmsSaveResult
 * @property {UpdateBlockItem[]} dirtyUpdates
 * @property {number} dirtyCount
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
    blocksStore, contentDraftsStore, setActiveBlock,
    clearDraft, clearDrafts, discardServerDrafts, settleDraftWrites,
    setBlockConflicts,
  } = useCmsContext();
  // Whole-map subscriptions: this aggregates every dirty blockPath for the
  // drawer's live dirty count, so it re-renders on any draft change. Fine for
  // a single admin surface.
  const drafts = useStoreSelector(contentDraftsStore, (m) => m);
  const pathname = usePathname() ?? "/";
  const blocks = useStoreSelector(blocksStore, (s) => s.get(pathname) ?? EMPTY_BLOCKS);
  const { savePage, isSaving, error } = useCmsAdmin();

  // A block is dirty when its effective value (local draft, else server-side
  // `draftValue`) differs from published `block.value`. Local edits win over
  // server drafts; `seen` dedupes when both layers exist for one block.
  /** @type {UpdateBlockItem[]} */
  const dirtyUpdates = useMemo(() => {
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
    return out;
  }, [drafts, blocks]);

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
      settleDraftWrites(dirtyUpdates.map((u) => u.blockPath));
      for (const u of dirtyUpdates) clearDraft(u.blockPath);
      // Whatever a previous attempt clashed on is settled now.
      setBlockConflicts([]);
      setActiveBlock(null);
    } catch {
      // Error surfaced via useCmsAdmin().error; keep drafts so the user can retry.
    }
  }, [dirtyUpdates, savePage, clearDraft, setActiveBlock, settleDraftWrites, setBlockConflicts]);

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
    isSaving,
    error,
    save,
    discard,
  };
}