"use client";

/**
 * @file `useCmsBlock(blockPath)`: single-block view over the shared blocks map
 * populated by `useCmsContent`. Returns an `update(value)` callback that
 * handles the version bookkeeping for editors.
 */

import { useCallback } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { resolveBlockValue } from "../resolve.js";
import { useCmsAdmin } from "./use-cms-admin.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { BlockResponse, UpdatePageResponse, BlockType } from "../../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} UseCmsBlockResult
 * @property {*} value
 * @property {number|null} version
 * @property {BlockType|null} blockType
 * @property {BlockResponse|null} block
 * @property {(value: *) => Promise<UpdatePageResponse>} update
 * @property {boolean} exists
 */

/**
 * @typedef {Object} UseCmsBlockMeta
 * @property {import("../../shared/contracts/schemas.js").BlockType} blockType
 * @property {*} defaultValue
 *
 * Discovery-only metadata: the manifest scanner reads this second arg to
 * register read-only blocks (no `<EditableRegion>`) into the sync manifest.
 * Runtime ignores it. Pass static literals; the scanner can't evaluate variables.
 */

/**
 * @param {string} blockPath
 * @param {UseCmsBlockMeta} [_meta]  Discovery-only metadata; runtime no-op.
 * @returns {UseCmsBlockResult}
 */
export function useCmsBlock(blockPath, _meta) {
  void _meta;
  const { blocksStore } = useCmsContext();
  const { save } = useCmsAdmin();
  const { pathname } = useCmsRoute();

  // Just this block's entry on this route, so another block's save doesn't
  // re-render us and a navigation resolves against the new page at once.
  const block = useStoreSelector(blocksStore, (s) => s.get(pathname)?.get(blockPath) ?? null);

  const update = useCallback(
    /**
     * @param {*} value
     * @returns {Promise<UpdatePageResponse>}
     */
    (value) => {
      if (!block) {
        return Promise.reject(
          new Error(`useCmsBlock: unknown blockPath "${blockPath}"`),
        );
      }
      return save(blockPath, value, block.version);
    },
    [save, blockPath, block],
  );

  return {
    // Effective value: backend draft overlay wins over published. Callers
    // needing the published version can read `block.value` / `block.draftValue`
    // off the returned `block`.
    value: resolveBlockValue(block),
    version: block ? block.version : null,
    blockType: block ? block.blockType : null,
    block,
    update,
    exists: Boolean(block),
  };
}