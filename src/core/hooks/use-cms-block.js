"use client";

/**
 * @file `useCmsBlock(blockPath)`: single-block view over the shared blocks map
 * populated by `useCmsContent`. Returns an `update(value)` callback that
 * handles the version bookkeeping for editors.
 */

import { useCallback, useEffect, useRef } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";
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
 * Metadata for a block declared here rather than by a region on the page.
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
 * @param {UseCmsBlockMeta} [meta]
 * @returns {UseCmsBlockResult}
 */
export function useCmsBlock(blockPath, meta) {
  const { blocksStore, isAdmin, registerChoiceSource, unregisterChoiceSource } = useCmsContext();
  const { save } = useCmsAdmin();
  const { pathname } = useCmsRoute();

  // Just this block's entry on this route, so another block's save doesn't
  // re-render us and a navigation resolves against the new page at once.
  const block = useStoreSelector(blocksStore, (s) => s.get(pathname)?.get(blockPath) ?? null);

  // Keyed on the source's shape, not its identity: callers write it inline, so
  // an unchanged literal would otherwise unregister and re-register on every
  // render of the component holding it. Same reasoning as `<EditableList>`.
  const source = meta?.source;
  const allowCustom = meta?.allowCustom;
  const sourceKey = source ? stableStringify(source) : null;
  const entryRef = useRef(/** @type {*} */ (null));
  entryRef.current = source ? { source, allowCustom } : null;
  useEffect(() => {
    // Nothing reads the registry outside the drawer, so a public visitor pays
    // nothing for a declaration meant for editors.
    if (!isAdmin || !entryRef.current) return undefined;
    registerChoiceSource(blockPath, entryRef.current);
    return () => unregisterChoiceSource(blockPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, blockPath, sourceKey, allowCustom, registerChoiceSource, unregisterChoiceSource]);

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