"use client";

/**
 * @file `useMyCollections()`: thin reader over the provider-level /me cache.
 * The fetch lives in the provider (one round-trip per admin session), so every
 * drawer surface reads the result without its own request. Public visitors get
 * `collections: []` with no fetch. `refetch()` bumps a token to re-run it.
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
