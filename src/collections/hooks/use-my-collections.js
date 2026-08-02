"use client";

/**
 * @file `useMyCollections()`: thin reader over the provider-level /me cache.
 * The fetch lives in the provider (one round-trip per admin session), so every
 * drawer surface reads the result without its own request. Public visitors get
 * `collections: []` with no fetch. `refetch()` bumps a token to re-run it.
 */

import { useCollectionContext } from "../context.js";
import { useStoreSelector } from "../../shared/state/store.js";

/**
 * @import { MyCollectionResponse } from "../../shared/contracts/schemas.js"
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
  const { collectionStore, refetchMyCollections } = useCollectionContext();
  // Three narrow selectors rather than one on `meta`: selecting the whole slice
  // would re-render every caller on the loading flip, and `order` is the stored
  // array, so no selector here allocates (see shared/state/store.js).
  const collections = useStoreSelector(collectionStore, (s) => s.meta.order);
  const isLoading = useStoreSelector(collectionStore, (s) => s.meta.isLoading);
  const error = useStoreSelector(collectionStore, (s) => s.meta.error);
  return { collections, isLoading, error, refetch: refetchMyCollections };
}

/**
 * One collection's `/me` entry, or `null` while loading or when the user can't
 * reach it. Exists so a card doesn't scan the whole list per render.
 *
 * @param {string} key
 * @returns {MyCollectionResponse | null}
 */
export function useCollectionMeta(key) {
  const { collectionStore } = useCollectionContext();
  return useStoreSelector(collectionStore, (s) => s.meta.byKey.get(key) ?? null);
}
