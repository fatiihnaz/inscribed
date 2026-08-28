"use client";

/**
 * @file `useCmsBlock(blockPath)`: single-block view over the shared blocks map
 * populated by `useCmsContent`. Returns an `update(value)` callback that
 * handles the version bookkeeping for editors.
 */

import { useCallback } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { useDeclaredChoiceSource } from "./use-declared-choice-source.js";
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
 * Metadata for a block that has nothing on the page to declare it.
 *
 * A region wraps an element and can therefore carry the hover ring and the chip
 * that opens the drawer; a hook has no element, so this is the path for a value
 * with no presence on screen at all: a document title, a meta tag, a setting
 * that only ever reaches an API call. Anything you actually render belongs on
 * `<EditableRegion>`, whose function-children mode takes any type.
 *
 * `blockType` and `defaultValue` are what the manifest scanner reads to seed the
 * row. `source` is not in the manifest and never goes to the backend: the
 * choices are the page's business, and only the drawer needs them, so it is
 * registered at runtime instead.
 *
 * Pass static literals throughout; the scanner can't evaluate variables.
 *
 * @typedef {Object} UseCmsBlockMeta
 * @property {import("../../shared/contracts/schemas.js").DeclarableBlockType} blockType
 * @property {*} defaultValue
 * @property {import("../../shared/contracts/schemas.js").ChoiceSource} [source]
 *   `Select` and `StringArray` only: where their choices come from. These two
 *   types draw nothing on the page, so there is no region to declare it on and
 *   without it the drawer has no list to offer.
 * @property {boolean} [allowCustom]
 *   Whether the editor may enter something the source does not offer. Off by
 *   default, which makes a source a closed vocabulary.
 */

/**
 * @param {string} blockPath
 * @param {UseCmsBlockMeta} [meta]  Declares a block with nothing on the page.
 * @returns {UseCmsBlockResult}
 */
export function useCmsBlock(blockPath, meta) {
  const { blocksStore } = useCmsContext();
  const { save } = useCmsAdmin();
  const { pathname } = useCmsRoute();

  useDeclaredChoiceSource(blockPath, meta?.source, meta?.allowCustom);

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

