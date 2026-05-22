"use client";

/**
 * @file `useCmsSave()` - drawer-side save orchestration on top of
 * `useCmsAdmin()`.
 *
 * Computes the dirty-update set from the current `drafts` Map plus any
 * server-side `block.draftValue` overlays, exposes a `save()` that PUTs
 * them and clears the matching local drafts on success, and a `discard()`
 * that wipes both local and backend drafts in one shot.
 *
 * Lives outside `AdminDrawer.jsx` so the drawer renders pure layout and
 * the save flow stays unit-testable in isolation.
 */

import { useCallback, useMemo } from "react";

import { useCmsContext } from "../lib/context.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { useCmsAdmin } from "./use-cms-admin.js";

/**
 * @import { UpdateBlockItem } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsSaveResult
 * @property {UpdateBlockItem[]} dirtyUpdates
 * @property {number} dirtyCount
 * @property {boolean} isSaving
 * @property {Error|null} error
 * @property {() => Promise<void>} save     PUT all dirty updates, then clear matching local drafts.
 * @property {() => void} discard           Wipe local edits + queue published values for blocks with backend drafts (autosave then clears them).
 */

/**
 * @returns {UseCmsSaveResult}
 */
export function useCmsSave() {
  const {
    blocks, drafts, setDraft, clearDraft, clearDrafts, setActiveBlock,
  } = useCmsContext();
  const { savePage, isSaving, error } = useCmsAdmin();

  // A block is "dirty" if its effective value (local draft, else server-side
  // `draftValue`) differs from the published `block.value`. Local edits
  // always win over server-side drafts - if the admin opened the page with
  // a backend draft and then typed something, only their typed value is
  // publish-worthy. The `seen` set dedupes when both layers exist for the
  // same block.
  /** @type {UpdateBlockItem[]} */
  const dirtyUpdates = useMemo(() => {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {UpdateBlockItem[]} */
    const out = [];
    for (const [blockPath, value] of drafts) {
      const block = blocks.get(blockPath);
      if (!block) continue;
      if (stableStringify(value) === stableStringify(block.value)) continue;
      out.push({ blockPath, value, version: block.version });
      seen.add(blockPath);
    }
    for (const block of blocks.values()) {
      if (block.draftValue == null) continue;
      if (seen.has(block.blockPath)) continue;
      // Backend's auto-clean already filters draft===published, but be
      // defensive in case a stale optimistic update reaches us first.
      if (stableStringify(block.draftValue) === stableStringify(block.value)) continue;
      out.push({
        blockPath: block.blockPath,
        value: block.draftValue,
        version: block.version,
      });
    }
    return out;
  }, [drafts, blocks]);

  const save = useCallback(async () => {
    if (dirtyUpdates.length === 0) return;
    try {
      await savePage(dirtyUpdates);
      for (const u of dirtyUpdates) clearDraft(u.blockPath);
      setActiveBlock(null);
    } catch {
      // Error surfaced via useCmsAdmin().error - keep drafts intact so the
      // user can retry / inspect.
    }
  }, [dirtyUpdates, savePage, clearDraft, setActiveBlock]);

  const discard = useCallback(() => {
    // Wipe local edits, then queue published values for any block that
    // still has a server-side draft. The autosave effect picks those up
    // ~1s later and (because each value === published) the backend
    // auto-cleans the corresponding Redis entries on receipt.
    clearDrafts();
    for (const block of blocks.values()) {
      if (block.draftValue != null) {
        setDraft(block.blockPath, block.value);
      }
    }
  }, [blocks, clearDrafts, setDraft]);

  return {
    dirtyUpdates,
    dirtyCount: dirtyUpdates.length,
    isSaving,
    error,
    save,
    discard,
  };
}