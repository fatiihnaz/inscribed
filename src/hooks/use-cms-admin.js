"use client";

/**
 * @file `useCmsAdmin()` - write-side hook.
 *
 * Wraps `PUT /cms/content`. Disabled (returns errors) when `isAdmin` is
 * false or `userSub` is null. On a successful save, triggers a refetch so
 * other hooks see the new versions without manual coordination.
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { updateContent, CmsApiError } from "../lib/api-client.js";

/**
 * @import { UpdateBlockItem, UpdatePageResponse } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsAdminResult
 * @property {(blockPath: string, value: *, version: number) => Promise<UpdatePageResponse>} save
 * @property {(blocks: UpdateBlockItem[]) => Promise<UpdatePageResponse>} savePage
 * @property {boolean} isSaving
 * @property {CmsApiError|Error|null} error
 * @property {UpdatePageResponse|null} lastResult
 * @property {boolean} canSave  False when not admin or no userSub.
 */

/**
 * @returns {UseCmsAdminResult}
 */
export function useCmsAdmin() {
  const { config, isAdmin, userSub, triggerRefetch, onAfterSave, getAccessToken } =
    useCmsContext();
  const pathname = usePathname() ?? "/";

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(/** @type {Error|null} */ (null));
  const [lastResult, setLastResult] = useState(
    /** @type {UpdatePageResponse|null} */ (null),
  );

  const canSave = isAdmin && Boolean(userSub);

  const savePage = useCallback(
    /**
     * @param {UpdateBlockItem[]} blocks
     * @returns {Promise<UpdatePageResponse>}
     */
    async (blocks) => {
      if (!canSave) {
        const err = new Error(isAdmin ? "Cannot save: missing userSub" : "Cannot save: not in admin mode");
        setError(err);
        throw err;
      }
      setIsSaving(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        const result = await updateContent(
          config,
          /** @type {string} */ (userSub),
          { slug: pathname, blocks },
          accessToken || undefined,
        );
        setLastResult(result);
        triggerRefetch();
        // Drop the server's ISR cache for this slug so a subsequent
        // navigation/refresh re-renders with the freshly-saved value
        // instead of whatever `getCmsContent` cached up to 60s ago.
        // Failures here are non-fatal - the client refetch already
        // updated in-memory state.
        try {
          await onAfterSave(pathname);
        } catch (revalidateErr) {
          // eslint-disable-next-line no-console
          console.warn("[skylab-cms] onAfterSave failed:", revalidateErr);
        }
        return result;
      } catch (err) {
        setError(/** @type {Error} */ (err));
        if (err instanceof CmsApiError && err.isConflict) {
          // Pull fresh versions so the next save attempt isn't doomed.
          triggerRefetch();
        }
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [canSave, isAdmin, config, userSub, pathname, triggerRefetch, onAfterSave, getAccessToken],
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

  return { save, savePage, isSaving, error, lastResult, canSave };
}