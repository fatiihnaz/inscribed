"use client";

/**
 * @file `useCollection(key)` / `useCollectionItem(key, slug)` - client-side
 * fetchers for the global Collections API (`/cms/collections/{key}`).
 *
 * Single-item reads (`useCollectionItem`) route through a provider-level
 * cache: two consumers mounted simultaneously for the same `(key, slug)`
 * share one round-trip, and a successful save through
 * `AdminCollectionEditor` updates the cache directly so the page-side
 * preview re-renders without a fetch. List reads (`useCollection`) still
 * fetch per consumer for now - list caching can land alongside
 * Region-tab work.
 *
 * Auth: pulls the current session's access token from `useCmsContext`
 * and forwards it as `Authorization: Bearer`. The Collections endpoint
 * requires `cms:access`; unauthenticated visitors will see the resulting
 * 401 surface through `error`.
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
 *   Optional filter + offset + limit. Each (key, params) tuple has its
 *   own cache entry, so the same hook called with different params
 *   from sibling components fires its own fetch (still deduped per
 *   identical params via the in-flight table).
 * @returns {UseCollectionResult}
 */
export function useCollection(key, params) {
  const { collectionStore, requestCollectionList } = useCollectionContext();

  // Stabilise the params identity so consumers passing inline literals
  // (`{ filter: { featured: true } }`) don't re-trigger the effect on
  // every render. The serialised form doubles as our cache key.
  const paramsKey = stableStringify(params ?? {});
  const stableParams = useMemo(() => params, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cacheKey = `${key}|${paramsKey}`;

  // Subscribe to just this window's list entry. The store notifies every
  // subscriber on any write, but `useStoreSelector` bails out of a
  // re-render unless our slice's reference changed - so a publish in an
  // unrelated window, or a keystroke in some other collection, doesn't
  // re-render this list.
  const entry = useStoreSelector(collectionStore, (s) => s.listCache.get(cacheKey));
  // Separate boolean selector so the fetch effect re-fires only on a
  // present <-> absent transition (invalidation drop / refill), not on
  // every loading->loaded entry-identity change.
  const hasEntry = useStoreSelector(collectionStore, (s) => s.listCache.has(cacheKey));
  useEffect(() => {
    requestCollectionList(key, stableParams);
  }, [key, stableParams, hasEntry, requestCollectionList]);

  const refetch = useCallback(async () => {
    await requestCollectionList(key, stableParams, true);
  }, [key, stableParams, requestCollectionList]);

  // Live-edit overlay: page-side consumers should see the admin's
  // in-progress edits the moment they're typed. Subscribe to the draft map
  // but bail unless a draft for one of THIS window's current rows changed -
  // so editing row X only re-renders the lists actually showing X.
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

  // Fall back to `item.draftData` (server-persisted draft) when there's no
  // local overlay, then to published `item.data`. Always runs - even with
  // no live drafts, rows may carry `draftData` from the server and we want
  // that promoted to `data` on first paint.
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
 * Apply the live-edit overlay onto an item: a local in-progress draft wins,
 * then the server-persisted `draftData`, then the published `data`. Returns
 * the original reference when nothing changes so `useMemo` / downstream
 * consumers don't see spurious identity churn.
 *
 * @param {CollectionItemResponse} row
 * @param {*} localDraft  The store's `drafts` entry for this row, or
 *   `undefined` when no editor is live-editing it.
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
 *   `overlayDrafts` defaults to true: page-side consumers see the
 *   admin's live in-progress edits applied to `item.data`. The drawer
 *   editor itself passes `false` so it always reads the raw server-side
 *   item - otherwise the editor would consume its own overlay, the
 *   seeding effect would re-fire on every keystroke, and the autosave
 *   debounce timer would never finish counting down.
 * @returns {UseCollectionItemResult}
 */
export function useCollectionItem(key, slug, options) {
  const overlayDrafts = options?.overlayDrafts ?? true;
  const { collectionStore, requestCollectionItem } = useCollectionContext();
  const cacheKey = `${key}:${slug}`;

  // Subscribe to just this item's cache entry and its own draft slice. A
  // write to any other slug leaves both selectors' references untouched, so
  // `useStoreSelector` bails and this consumer doesn't re-render - typing in
  // row X only re-renders the consumers reading X.
  const entry = useStoreSelector(collectionStore, (s) => s.itemCache.get(cacheKey));
  const draft = useStoreSelector(collectionStore, (s) => s.drafts.get(cacheKey));

  // Trigger a fetch when the key/slug pair changes, or when an external
  // `invalidateCollectionItem` drops the entry. The presence flag is
  // needed because `requestCollectionItem` is stable across cache
  // mutations (so consumer effects don't churn on every draft autosave),
  // so without it the dropped entry would never refill until remount.
  // `requestCollectionItem` itself dedupes against cache hits + in-flight
  // requests, so two consumers mounted simultaneously share one round-trip.
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
