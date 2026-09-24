"use client";

/**
 * @file `usePendingDrafts`: the half-finished new record of each language, as
 * the list windows carry it. The backend keeps one pending slot per collection
 * and language and returns it on every editor listing in that language, so
 * each language is read through a window of its own.
 */

import { useEffect, useMemo } from "react";

import { useCollectionContext } from "../context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";

/**
 * @import { CollectionListParams } from "../../shared/contracts/schemas.js"
 * @import { CollectionListCacheEntry } from "../context.js"
 */

/**
 * @param {string} collectionKey
 * @param {string[]} languages
 * @param {CollectionListParams} [baseParams]
 *   The window each language is read through, with its locale replaced.
 *   Passing a list's own window shares that list's cache entry for its
 *   language instead of fetching a second one.
 * @returns {Map<string, Record<string, *> | null>}
 *   Each language's draft data, null while it has none or it has not arrived.
 */
export function usePendingDrafts(collectionKey, languages, baseParams) {
  const { collectionStore, requestCollectionList } = useCollectionContext();

  const languagesKey = languages.join("|");
  const baseKey = stableStringify(baseParams ?? null);
  const windows = useMemo(
    () => languages.map((locale) => {
      const params = { ...(baseParams ?? { limit: 50 }), locale };
      return { locale, params, cacheKey: `${collectionKey}|${stableStringify(params)}` };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collectionKey, languagesKey, baseKey],
  );

  // The same waits as `useCollection`: not before /me has said which languages
  // the collection takes, and again whenever a save drops a window.
  const metaLoading = useStoreSelector(collectionStore, (s) => s.meta.isLoading);
  const present = useStoreSelector(
    collectionStore,
    (s) => windows.map((w) => (s.listCache.has(w.cacheKey) ? "1" : "0")).join(""),
  );
  useEffect(() => {
    if (metaLoading) return;
    for (const w of windows) requestCollectionList(collectionKey, w.params);
  }, [collectionKey, windows, present, metaLoading, requestCollectionList]);

  const drafts = useStoreSelector(
    collectionStore,
    (s) => windows.map((w) => pendingDraft(s.listCache.get(w.cacheKey))),
    sameEntries,
  );
  return useMemo(
    () => new Map(windows.map((w, i) => [w.locale, drafts[i]])),
    [windows, drafts],
  );
}

/**
 * @param {CollectionListCacheEntry | undefined} entry
 * @returns {Record<string, *> | null}
 */
function pendingDraft(entry) {
  const row = entry?.virtualItems?.find((r) => r.origin === "pending");
  return row?.draftData ?? null;
}

/**
 * Element-wise identity, so the selector above may allocate its array freely.
 *
 * @param {readonly unknown[]} a
 * @param {readonly unknown[]} b
 */
function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
