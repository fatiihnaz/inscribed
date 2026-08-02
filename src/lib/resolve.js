/**
 * @file The precedence rules for "what value does this thing actually show".
 * Pure, no React. These were written out at a dozen call sites and had already
 * drifted into three spellings, so a change to the layering (say, a new draft
 * tier) had to be found in every one of them.
 */

import { deepEqual } from "./deep-equal.js";

/**
 * @import { BlockResponse, CollectionItemResponse } from "./schemas.js"
 */

/**
 * A block's effective value: the live local draft, else the server-side draft,
 * else the published value.
 *
 * `hasLocalDraft` is separate from `localDraft` on purpose: an explicit empty or
 * `null` draft is a real edit, and `localDraft !== undefined` would read it as
 * "no draft" and fall through to the published value.
 *
 * Callers with no local layer (a read-only reader, the autosave's own
 * comparison) pass the block alone.
 *
 * @param {BlockResponse | null | undefined} block
 * @param {boolean} [hasLocalDraft]
 * @param {*} [localDraft]
 * @returns {*} `undefined` when there is no block and no local draft.
 */
export function resolveBlockValue(block, hasLocalDraft = false, localDraft = undefined) {
  if (hasLocalDraft) return localDraft;
  if (!block) return undefined;
  return block.draftValue ?? block.value;
}

/**
 * Whether a block differs from what is published.
 *
 * A local draft counts only when it actually differs from `value`: typing a
 * change and undoing it by hand leaves a draft that is no longer dirty. Without
 * one, an untouched server draft is itself the unpublished change.
 *
 * Visibility is deliberately not a factor. A `readonly` or `hidden` block can
 * still carry a server draft, and dropping it here would leave that draft
 * unpublishable, since the card that would publish it is locked or absent.
 *
 * @param {BlockResponse | null | undefined} block
 * @param {boolean} hasLocalDraft
 * @param {*} localDraft
 * @returns {boolean}
 */
export function isBlockDirty(block, hasLocalDraft, localDraft) {
  if (!block) return false;
  return hasLocalDraft ? !deepEqual(localDraft, block.value) : block.draftValue != null;
}

/**
 * Overlay a collection row for display: the live local draft wins, else the
 * server draft is promoted over `data`.
 *
 * Returns the original reference when nothing changes, so a list re-render
 * doesn't hand every consumer a new object.
 *
 * @param {CollectionItemResponse} row
 * @param {*} localDraft  The `drafts` entry for this row, or `undefined`.
 * @returns {CollectionItemResponse}
 */
export function resolveItemData(row, localDraft) {
  if (localDraft !== undefined) {
    return { ...row, data: localDraft, draftData: localDraft };
  }
  if (row.draftData != null) {
    return { ...row, data: row.draftData };
  }
  return row;
}
