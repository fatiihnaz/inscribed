"use client";

/**
 * @file `useCmsBlock(blockPath)`: single-block view over the shared blocks map
 * populated by `useCmsContent`. Returns an `update(value)` callback that
 * handles the version bookkeeping for editors.
 */

import { useCallback } from "react";

import { useCmsContext } from "../lib/context.js";
import { useCmsAdmin } from "./use-cms-admin.js";

/**
 * @import { BlockResponse, UpdatePageResponse, BlockType } from "../lib/schemas.js"
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
 * @property {import("../lib/schemas.js").BlockType} blockType
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
  const { blocks } = useCmsContext();
  const { save } = useCmsAdmin();

  const block = blocks.get(blockPath) ?? null;

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
    value: block ? (block.draftValue ?? block.value) : undefined,
    version: block ? block.version : null,
    blockType: block ? block.blockType : null,
    block,
    update,
    exists: Boolean(block),
  };
}