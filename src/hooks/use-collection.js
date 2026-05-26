"use client";

/**
 * @file `useCollection(key)` / `useCollectionItem(key, slug)` - client-side
 * fetchers for the global Collections API (`/cms/collections/{key}`).
 *
 * Single-item reads (`useCollectionItem`) route through a provider-level
 * cache: two consumers mounted simultaneously for the same `(key, slug)`
 * share one round-trip, and a successful save through
 * `AdminCollectionItemCard` updates the cache directly so the page-side
 * preview re-renders without a fetch. List reads (`useCollection`) still
 * fetch per consumer for now - list caching can land alongside
 * Region-tab work.
 *
 * Auth: pulls the current session's access token from `useCmsContext`
 * and forwards it as `Authorization: Bearer`. The Collections endpoint
 * requires `cms:access`; unauthenticated visitors will see the resulting
 * 401 surface through `error`.
 */

import { useCallback, useEffect } from "react";

import { useCmsContext } from "../lib/context.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/api-client.js"
 */

/**
 * @typedef {Object} UseCollectionResult
 * @property {CollectionItemResponse[]} items
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @param {string} key  Backend collection key, e.g. "Teams" or "News".
 * @returns {UseCollectionResult}
 */
export function useCollection(key) {
  const { collectionListCache, requestCollectionList } = useCmsContext();
  const entry = collectionListCache.get(key);

  useEffect(() => {
    requestCollectionList(key);
  }, [key, requestCollectionList]);

  const refetch = useCallback(async () => {
    await requestCollectionList(key, true);
  }, [key, requestCollectionList]);

  return {
    items: entry?.items ?? [],
    // No entry yet = fetch about to fire; treat as loading.
    isLoading: entry ? entry.isLoading : true,
    error: entry?.error ?? null,
    refetch,
  };
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
 * @returns {UseCollectionItemResult}
 */
export function useCollectionItem(key, slug) {
  const { collectionItemCache, requestCollectionItem } = useCmsContext();
  const cacheKey = `${key}:${slug}`;
  const entry = collectionItemCache.get(cacheKey);

  // Trigger a fetch when the key/slug pair changes. `requestCollectionItem`
  // dedupes against cache hits + in-flight requests, so two consumers
  // mounted simultaneously share a single round-trip.
  useEffect(() => {
    requestCollectionItem(key, slug);
  }, [key, slug, requestCollectionItem]);

  const refetch = useCallback(async () => {
    await requestCollectionItem(key, slug, true);
  }, [key, slug, requestCollectionItem]);

  return {
    item: entry?.item ?? null,
    // No entry yet = fetch is about to fire; treat as loading so consumers
    // don't briefly render the "loaded but empty" branch.
    isLoading: entry ? entry.isLoading : true,
    error: entry?.error ?? null,
    refetch,
  };
}
