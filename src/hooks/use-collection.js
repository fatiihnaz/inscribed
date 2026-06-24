"use client";

/**
 * @file `useCollection(key)` / `useCollectionItem(key, slug)`: client-side
 * fetchers for the Collections API (`/cms/collections/{key}`).
 *
 * Both route through a provider-level cache: consumers sharing a `(key, slug)`
 * or `(key, params)` window share one round-trip, and a drawer save updates the
 * cache directly so the page preview re-renders without a fetch.
 *
 * Auth: the access token comes from `useCmsContext` as `Authorization: Bearer`.
 * The endpoint requires `cms:access`, so anonymous visitors get a 401 via `error`.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useCollectionContext } from "../lib/collection-context.js";
import { useStoreSelector } from "../lib/store.js";
import { stableStringify } from "../lib/stable-stringify.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/errors.js"
 */

/**
 * @typedef {Object} UseCollectionResult
 * @property {CollectionItemResponse[]} items
 * @property {number} total
 * @property {number} offset
 * @property {number} limit
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @param {string} key  Backend collection key, e.g. "Teams" or "News".
 * @param {import("../lib/schemas.js").CollectionListParams} [params]
 *   Optional filter/offset/limit. Each (key, params) tuple is its own cache
 *   entry; identical params are deduped via the in-flight table.
 * @returns {UseCollectionResult}
 */
export function useCollection(key, params) {
  const { collectionStore, requestCollectionList } = useCollectionContext();

  // Stabilise params identity so inline literals don't re-trigger the effect
  // every render. The serialised form doubles as the cache key.
  const paramsKey = stableStringify(params ?? {});
  const stableParams = useMemo(() => params, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cacheKey = `${key}|${paramsKey}`;

  // Subscribe to just this window's list entry, so a write to an unrelated
  // window doesn't re-render this list.
  const entry = useStoreSelector(collectionStore, (s) => s.listCache.get(cacheKey));
  // Separate boolean selector so the fetch effect re-fires only on a present
  // <-> absent transition (invalidate/refill), not on every loading->loaded change.
  const hasEntry = useStoreSelector(collectionStore, (s) => s.listCache.has(cacheKey));
  useEffect(() => {
    requestCollectionList(key, stableParams);
  }, [key, stableParams, hasEntry, requestCollectionList]);

  const refetch = useCallback(async () => {
    await requestCollectionList(key, stableParams, true);
  }, [key, stableParams, requestCollectionList]);

  // Live-edit overlay: show the admin's edits as they type. Subscribe to the
  // draft map but bail unless a draft for one of this window's rows changed,
  // so editing row X only re-renders the lists showing X.
  const rowsRef = useRef(/** @type {CollectionItemResponse[] | undefined} */ (undefined));
  rowsRef.current = entry?.items;
  const drafts = useStoreSelector(
    collectionStore,
    (s) => s.drafts,
    (prev, next) => {
      if (prev === next) return true;
      const rows = rowsRef.current;
      if (!rows) return false;
      for (const row of rows) {
        const k = `${key}:${row.slug}`;
        if (prev.get(k) !== next.get(k)) return false;
      }
      return true;
    },
  );

  // Overlay precedence per row: local draft, else server `draftData`, else
  // published `data`. Always runs, since rows may arrive carrying `draftData`
  // that we want promoted to `data` on first paint.
  const items = useMemo(() => {
    const raw = entry?.items ?? [];
    return raw.map((row) => overlayItem(row, drafts.get(`${key}:${row.slug}`)));
  }, [entry, drafts, key]);

  return {
    items,
    total: entry?.total ?? 0,
    offset: entry?.offset ?? params?.offset ?? 0,
    limit: entry?.limit ?? params?.limit ?? 0,
    // No entry yet = fetch about to fire; treat as loading.
    isLoading: entry ? entry.isLoading : true,
    error: entry?.error ?? null,
    refetch,
  };
}

/**
 * Apply the overlay onto an item: local draft wins, then server `draftData`,
 * then published `data`. Returns the original reference when nothing changes
 * so consumers don't see spurious identity churn.
 *
 * @param {CollectionItemResponse} row
 * @param {*} localDraft  The `drafts` entry for this row, or `undefined`.
 * @returns {CollectionItemResponse}
 */
function overlayItem(row, localDraft) {
  if (localDraft !== undefined) {
    return { ...row, data: localDraft, draftData: localDraft };
  }
  if (row.draftData != null) {
    return { ...row, data: row.draftData };
  }
  return row;
}

/**
 * @typedef {Object} UseCollectionItemResult
 * @property {CollectionItemResponse | null} item
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error  `error.isNotFound === true` on 404.
 * @property {() => Promise<void>} refetch
 */

/**
 * @param {string} key   Backend collection key.
 * @param {string} slug  Item slug (lowercased server-side).
 * @param {{ overlayDrafts?: boolean }} [options]
 *   `overlayDrafts` (default true) applies the admin's live edits onto
 *   `item.data`. The drawer editor passes `false` so it reads the raw item;
 *   otherwise it would consume its own overlay, re-seed on every keystroke,
 *   and never let the autosave debounce finish.
 * @returns {UseCollectionItemResult}
 */
export function useCollectionItem(key, slug, options) {
  const overlayDrafts = options?.overlayDrafts ?? true;
  const { collectionStore, requestCollectionItem } = useCollectionContext();
  const cacheKey = `${key}:${slug}`;

  // Subscribe to just this item's cache entry and its own draft slice, so a
  // write to another slug doesn't re-render this consumer.
  const entry = useStoreSelector(collectionStore, (s) => s.itemCache.get(cacheKey));
  const draft = useStoreSelector(collectionStore, (s) => s.drafts.get(cacheKey));

  // Re-fetch on key/slug change or when `invalidateCollectionItem` drops the
  // entry. The presence flag is what catches that drop: `requestCollectionItem`
  // is stable across cache mutations, so without it a dropped entry would never
  // refill until remount. It also dedupes hits + in-flight requests, so
  // simultaneous consumers share one round-trip.
  const hasEntry = useStoreSelector(collectionStore, (s) => s.itemCache.has(cacheKey));
  useEffect(() => {
    requestCollectionItem(key, slug);
  }, [key, slug, hasEntry, requestCollectionItem]);

  const refetch = useCallback(async () => {
    await requestCollectionItem(key, slug, true);
  }, [key, slug, requestCollectionItem]);

  // Same overlay precedence as useCollection: local in-progress edits
  // win, then the server-persisted draft, then the published value.
  const item = entry?.item ?? null;
  const overlaidItem = useMemo(() => {
    if (!item) return null;
    if (!overlayDrafts) return item;
    return overlayItem(item, draft);
  }, [item, draft, overlayDrafts]);

  return {
    item: overlaidItem,
    // No entry yet = fetch is about to fire; treat as loading so consumers
    // don't briefly render the "loaded but empty" branch.
    isLoading: entry ? entry.isLoading : true,
    error: entry?.error ?? null,
    refetch,
  };
}
