"use client";

/**
 * @file `useCmsBlock(blockPath)` - single-block view.
 *
 * Reads from the shared blocks map populated by `useCmsContent`. Returns
 * an `update(value)` callback that handles the version bookkeeping so
 * editors don't have to track it themselves.
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
 * @param {string} blockPath
 * @returns {UseCmsBlockResult}
 */
export function useCmsBlock(blockPath) {
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
    value: block ? block.value : undefined,
    version: block ? block.version : null,
    blockType: block ? block.blockType : null,
    block,
    update,
    exists: Boolean(block),
  };
}