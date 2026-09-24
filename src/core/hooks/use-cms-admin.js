"use client";

/**
 * @file `useCmsAdmin()`: write-side hook wrapping `PUT /cms/content`. Errors
 * out when not admin. A successful save triggers a refetch so other hooks pick
 * up the new versions automatically.
 */

import { useCallback, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
import { globalsKey, routeKey } from "../../shared/route.js";
import { readBlock } from "../blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { UpdateBlockItem, UpdatePageResponse, BlockResponse } from "../../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} UseCmsAdminResult
 * @property {(blockPath: string, value: *, version: number) => Promise<UpdatePageResponse>} save
 * @property {(blocks: UpdateBlockItem[]) => Promise<UpdatePageResponse>} savePage
 *   Each target (slug and language) is its own write, so a batch can land
 *   partly. It then rejects with the first failure, carrying `landed`: the
 *   updates that went through, which are live and revalidated already.
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
  // `routeSlug` addresses the backend; the store key adds the language.
  const { slug: routeSlug, locale } = useCmsRoute();
  const key = routeKey(routeSlug, locale);
  const globals = globalsKey(locale);

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
        /** @type {Map<string, { slug: string, locale: string|null, updates: UpdateBlockItem[], sources: UpdateBlockItem[] }>} */
        const byTarget = new Map();
        const blocks = blocksStore.get();
        for (const update of updates) {
          const block = /** @type {BlockResponse | undefined} */ (
            readBlock(blocks, key, globals, update.blockPath)
          );
          const slug = block?._slug ?? routeSlug;
          const targetLocale = update.locale ?? locale;
          // JSON rather than a joined string: both halves are free-form, and
          // this key is only ever compared, never parsed back. Named apart from
          // the route key above, which the block lookup reads on each pass.
          const targetKey = JSON.stringify([targetLocale ?? null, slug]);
          const group = byTarget.get(targetKey) ?? { slug, locale: targetLocale, updates: [], sources: [] };
          // `locale` addresses the request, so it stays off the body items.
          group.updates.push({
            blockPath: update.blockPath,
            value: update.value,
            version: update.version,
          });
          // The caller's own objects, handed back as `landed` on a partial failure.
          group.sources.push(update);
          byTarget.set(targetKey, group);
        }

        const groups = [...byTarget.values()];
        // Settled rather than all: one target failing says nothing about the
        // others, and the ones that landed are live whatever happens next.
        const settled = await Promise.allSettled(
          groups.map((group) =>
            config.transport.updateContent(
              { slug: group.slug, blocks: group.updates },
              { accessToken: accessToken || undefined, locale: group.locale },
            ),
          ),
        );
        const landed = groups.filter((_, i) => settled[i].status === "fulfilled");
        const failed = settled.flatMap((outcome, i) => (
          outcome.status === "rejected" ? [{ group: groups[i], error: outcome.reason }] : []
        ));

        // Only this page's own language has cards to light up; a conflict on
        // another language's copy would flag the card whose path matches and
        // whose value is fine. Flagged before the refetch, so the cards are
        // already in conflict state when the other editor's values land.
        const ownConflict = failed.find((f) =>
          f.group.locale === locale && f.error instanceof CmsApiError && f.error.isConflict);
        if (ownConflict) setBlockConflicts((ownConflict.error.conflicts ?? []).map((c) => c.path));
        const anyConflict = failed.some((f) => f.error instanceof CmsApiError && f.error.isConflict);
        if (landed.length > 0 || anyConflict) triggerRefetch();

        // Drop ISR cache for every target that landed. Page and global slugs
        // are independent tags, so a header save must not leave page renders
        // stale. The locale rides along: each language is cached under its own
        // tag, so publishing the English copy must not rebuild the Turkish page.
        // In parallel: each one is its own Server Action round-trip, and the
        // save button waits on all of them.
        await Promise.all(
          landed.map(async (group) => {
            try {
              await onAfterSave(group.slug, group.locale);
            } catch (revalidateErr) {
              // eslint-disable-next-line no-console
              console.warn("[inscribed] onAfterSave failed:", revalidateErr);
            }
          }),
        );

        if (failed.length > 0) {
          const { error } = ownConflict ?? failed[0];
          error.landed = landed.flatMap((group) => group.sources);
          throw error;
        }

        // Aggregate per-slug counts into one totals object, same shape as a
        // single-PUT response.
        /** @type {UpdatePageResponse} */
        const result = settled.reduce(
          (acc, outcome) => (outcome.status === "fulfilled"
            ? {
              updated: acc.updated + outcome.value.updated,
              unchanged: acc.unchanged + outcome.value.unchanged,
            }
            : acc),
          { updated: 0, unchanged: 0 },
        );
        return result;
      } catch (err) {
        setError(/** @type {Error} */ (err));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [isAdmin, config, blocksStore, key, globals, routeSlug, locale, triggerRefetch, onAfterSave, getAccessToken, setBlockConflicts],
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