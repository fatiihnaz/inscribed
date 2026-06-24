"use client";

/**
 * @file `useMyCollections()` - thin reader over the provider-level /me
 * cache. The actual fetch lives in `CmsProvider`: one round-trip per
 * admin session, results stashed in context so every drawer surface
 * (per-Collection card, future per-Collection tab) reads them without
 * triggering its own request.
 *
 * Public visitors get `collections: []` with no fetch attempted.
 * `refetch()` bumps a token on the provider, re-running the effect
 * (e.g. after a save that might have changed canCreate / virtual-slug
 * eligibility).
 */

import { useCollectionContext } from "../lib/collection-context.js";

/**
 * @import { MyCollectionResponse } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseMyCollectionsResult
 * @property {MyCollectionResponse[]} collections
 * @property {boolean} isLoading
 * @property {Error|null} error
 * @property {() => void} refetch
 */

/**
 * @returns {UseMyCollectionsResult}
 */
export function useMyCollections() {
  const {
    myCollections,
    myCollectionsLoading,
    myCollectionsError,
    refetchMyCollections,
  } = useCollectionContext();
  return {
    collections: myCollections,
    isLoading: myCollectionsLoading,
    error: myCollectionsError,
    refetch: refetchMyCollections,
  };
}
