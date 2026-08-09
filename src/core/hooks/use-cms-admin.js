"use client";

/**
 * @file `useCmsAdmin()`: write-side hook wrapping `PUT /cms/content`. Errors
 * out when not admin. A successful save triggers a refetch so other hooks pick
 * up the new versions automatically.
 */

import { useCallback, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { UpdateBlockItem, UpdatePageResponse, BlockResponse } from "../../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} UseCmsAdminResult
 * @property {(blockPath: string, value: *, version: number) => Promise<UpdatePageResponse>} save
 * @property {(blocks: UpdateBlockItem[]) => Promise<UpdatePageResponse>} savePage
 * @property {boolean} isSaving
 * @property {CmsApiError|Error|null} error
 * @property {() => void} clearError
 *   Drop a failure the UI has finished reporting. `savePage` clears it on its
 *   own next run, which is too late for a banner outliving the edits it was
 *   about.
 */

/**
 * @returns {UseCmsAdminResult}
 */
export function useCmsAdmin() {
  // `blocksStore` is read inside `savePage`, never subscribed to: the slug
  // lookup wants the map at call time, and subscribing would re-render every
  // caller on each autosave roundtrip.
  const {
    config, isAdmin, blocksStore, triggerRefetch, onAfterSave, getAccessToken,
    setBlockConflicts,
  } = useCmsContext();
  // `pathname` keys the block cache, `routeSlug` addresses the backend. They
  // part ways as soon as the route carries a locale prefix.
  const { pathname, slug: routeSlug, locale } = useCmsRoute();

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

        // Group by the endpoint each update lands on, which is a slug *and* a
        // locale. A block lives on either the page or the global slug and must
        // PUT to its own; a staged translation carries a locale of its own and
        // must PUT to that language's copy. Both are one PUT per target, so
        // they group by the same rule rather than through two code paths.
        /** @type {Map<string, { slug: string, locale: string|null, updates: UpdateBlockItem[] }>} */
        const byTarget = new Map();
        const blocks = blocksStore.get().get(pathname) ?? new Map();
        for (const update of updates) {
          const block = /** @type {BlockResponse | undefined} */ (blocks.get(update.blockPath));
          const slug = block?._slug ?? routeSlug;
          const targetLocale = update.locale ?? locale;
          // JSON rather than a joined string: both halves are free-form, and
          // this key is only ever compared, never parsed back.
          const key = JSON.stringify([targetLocale ?? null, slug]);
          const group = byTarget.get(key) ?? { slug, locale: targetLocale, updates: [] };
          // `locale` addresses the request, so it stays off the body items.
          group.updates.push({
            blockPath: update.blockPath,
            value: update.value,
            version: update.version,
          });
          byTarget.set(key, group);
        }

        const groups = [...byTarget.values()];
        const responses = await Promise.all(
          groups.map((group) =>
            config.transport.updateContent(
              { slug: group.slug, blocks: group.updates },
              { accessToken: accessToken || undefined, locale: group.locale },
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
        // The locale rides along: each language is cached under its own tag, so
        // publishing the English copy must not rebuild the Turkish page.
        // In parallel: each one is its own Server Action round-trip, and the
        // save button waits on all of them.
        await Promise.all(
          groups.map(async (group) => {
            try {
              await onAfterSave(group.slug, group.locale);
            } catch (revalidateErr) {
              // eslint-disable-next-line no-console
              console.warn("[inscribed] onAfterSave failed:", revalidateErr);
            }
          }),
        );
        return result;
      } catch (err) {
        setError(/** @type {Error} */ (err));
        if (err instanceof CmsApiError && err.isConflict) {
          // Flag the named blocks before the refetch, so the cards are already
          // in conflict state when the other editor's values land in them. A
          // plain write race carries no `conflicts`, and flags nothing.
          //
          // Only when the batch went to a single language: `Promise.all` hands
          // back the first rejection without saying which PUT raised it, and a
          // conflict on the English copy would light up the Turkish card, whose
          // path matches and whose value is fine. The banner still reports it.
          const singleLocale = updates.every((u) => (u.locale ?? locale) === locale);
          if (singleLocale) setBlockConflicts((err.conflicts ?? []).map((c) => c.path));
          triggerRefetch();
        }
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [isAdmin, config, blocksStore, pathname, routeSlug, locale, triggerRefetch, onAfterSave, getAccessToken, setBlockConflicts],
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

  const clearError = useCallback(() => setError(null), []);

  return { save, savePage, isSaving, error, clearError };
}