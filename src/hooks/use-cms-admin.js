"use client";

/**
 * @file `useCmsAdmin()`: write-side hook wrapping `PUT /cms/content`. Errors
 * out when not admin. A successful save triggers a refetch so other hooks pick
 * up the new versions automatically.
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { CmsApiError } from "../lib/errors.js";

/**
 * @import { UpdateBlockItem, UpdatePageResponse, BlockResponse } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsAdminResult
 * @property {(blockPath: string, value: *, version: number) => Promise<UpdatePageResponse>} save
 * @property {(blocks: UpdateBlockItem[]) => Promise<UpdatePageResponse>} savePage
 * @property {boolean} isSaving
 * @property {CmsApiError|Error|null} error
 */

/**
 * @returns {UseCmsAdminResult}
 */
export function useCmsAdmin() {
  const { config, isAdmin, blocks, triggerRefetch, onAfterSave, getAccessToken } =
    useCmsContext();
  const pathname = usePathname() ?? "/";

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(/** @type {Error|null} */ (null));

  const savePage = useCallback(
    /**
     * @param {UpdateBlockItem[]} updates
     * @returns {Promise<UpdatePageResponse>}
     */
    async (updates) => {
      if (!isAdmin) {
        const err = new Error("Cannot save: not in admin mode");
        setError(err);
        throw err;
      }
      setIsSaving(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();

        // Group updates by source slug. A block lives on either the page or
        // the global slug, and must PUT to its own slug. The multi-PUT path
        // only kicks in when one batch edits both a page block and a global one.
        /** @type {Map<string, UpdateBlockItem[]>} */
        const bySlug = new Map();
        for (const update of updates) {
          const block = /** @type {BlockResponse | undefined} */ (blocks.get(update.blockPath));
          const slug = block?._slug ?? pathname;
          const list = bySlug.get(slug) ?? [];
          list.push(update);
          bySlug.set(slug, list);
        }

        const groups = [...bySlug.entries()];
        const responses = await Promise.all(
          groups.map(([slug, slugUpdates]) =>
            config.transport.updateContent(
              { slug, blocks: slugUpdates },
              { accessToken: accessToken || undefined },
            ),
          ),
        );

        // Aggregate per-slug counts into one totals object, same shape as a
        // single-PUT response.
        /** @type {UpdatePageResponse} */
        const result = responses.reduce(
          (acc, r) => ({
            updated: acc.updated + r.updated,
            unchanged: acc.unchanged + r.unchanged,
          }),
          { updated: 0, unchanged: 0 },
        );

        triggerRefetch();

        // Drop ISR cache for every slug we wrote. Page and global slugs are
        // independent tags, so a header save must not leave page renders stale.
        for (const [slug] of groups) {
          try {
            await onAfterSave(slug);
          } catch (revalidateErr) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] onAfterSave failed:", revalidateErr);
          }
        }
        return result;
      } catch (err) {
        setError(/** @type {Error} */ (err));
        if (err instanceof CmsApiError && err.isConflict) {
          triggerRefetch();
        }
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [isAdmin, config, blocks, pathname, triggerRefetch, onAfterSave, getAccessToken],
  );

  const save = useCallback(
    /**
     * @param {string} blockPath
     * @param {*} value
     * @param {number} version
     * @returns {Promise<UpdatePageResponse>}
     */
    (blockPath, value, version) =>
      savePage([{ blockPath, value, version }]),
    [savePage],
  );

  return { save, savePage, isSaving, error };
}