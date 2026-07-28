"use client";

/**
 * @file Internal Collections React context: the whole collection namespace
 * (item/list cache store, bindings registry, `/me` schemas, request/draft
 * handlers), held separately from the core `CmsContext`. Wired by
 * `CollectionProvider`, consumed via `useCollectionContext`.
 *
 * Kept apart because collections are opt-in (`inscribed/collections`) and the
 * core editor must not depend on this layer. The provider reads `config`,
 * `isAdmin`, and `getAccessToken` from `CmsContext`, so it must mount inside
 * `<CmsProvider>`.
 */

import { createContext, useContext } from "react";

import { stableStringify } from "./stable-stringify.js";

/**
 * @import { MyCollectionResponse, CollectionItemResponse, CollectionBinding } from "./schemas.js"
 */

// Collection bindings share the drawer's single `activeBlock` channel with
// content blocks, so their ids must be unreachable as a content path. Content
// paths are dot-separated identifiers and never contain a colon.
const BINDING_NS = "collection:";

/**
 * Identity of a `<CollectionItem>` binding: the record it points at, not where
 * it is rendered. Two components showing the same record are one binding, and
 * one drawer card, however the page nests them.
 *
 * @param {string} collection
 * @param {string} slug
 * @returns {string}
 */
export function collectionItemBindingId(collection, slug) {
  return `${BINDING_NS}${collection}:${slug}`;
}

/**
 * Identity of a `<CollectionRegion>` binding: the (collection, filter) window.
 * `limit` / `offset` stay out of it on purpose: the drawer's region panel
 * already collapses windows by filter signature, so two paginations of one
 * filtered list would be one section anyway.
 *
 * @param {string} collection
 * @param {Record<string, *>} [filter]
 * @returns {string}
 */
export function collectionRegionBindingId(collection, filter) {
  return `${BINDING_NS}${collection}|${stableStringify(filter ?? null)}`;
}

/**
 * @typedef {Object} CollectionItemCacheEntry
 * @property {CollectionItemResponse | null} item
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * One page of `useCollection` data. Each (collection, params) tuple gets its
 * own entry so different filter/pagination windows don't share state.
 *
 * @typedef {Object} CollectionListCacheEntry
 * @property {CollectionItemResponse[]} items
 * @property {number} total
 * @property {number} offset
 * @property {number} limit
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * Shape of the value held in `CollectionContext`.
 *
 * @typedef {Object} CollectionContextValue
 * @property {{ key: string, slug: string } | null} activeCollectionItem
 *   Drawer-side "open this row" signal. Set alongside the active tab when the
 *   StatusBar's "Aç" CTA targets an item; the matching card auto-expands on
 *   render, then clears it so revisiting the tab doesn't re-open the row.
 * @property {(target: { key: string, slug: string } | null) => void} setActiveCollectionItem
 * @property {Map<string, CollectionBinding>} collectionBindings
 *   Runtime registry populated by `<CollectionItem>` / `<CollectionRegion>` on
 *   mount. Collections aren't in the CMS block namespace, so this is how the
 *   AdminDrawer learns the bindings on the current page. Keyed by the binding's
 *   own identity (see `collectionItemBindingId` / `collectionRegionBindingId`);
 *   `slug` is set for items, omitted for list regions. Region bindings also
 *   carry filter/limit/offset so the drawer mirrors them.
 * @property {(bindingId: string, binding: CollectionBinding) => void} registerCollectionBinding
 *   Refcounted: the same binding registered twice is one entry, and the first
 *   registration's value wins.
 * @property {(bindingId: string) => void} unregisterCollectionBinding
 * @property {MyCollectionResponse[]} myCollections
 *   `GET /cms/collections/me`, fetched once per session when `isAdmin` (empty
 *   for public visitors). All drawer surfaces read schemas from here instead
 *   of re-fetching /me per card.
 * @property {boolean} myCollectionsLoading
 * @property {Error|null} myCollectionsError
 * @property {() => void} refetchMyCollections   Bump-token style; the provider re-runs the /me effect.
 * @property {import("./store.js").Store<{ itemCache: Map<string, CollectionItemCacheEntry>, listCache: Map<string, CollectionListCacheEntry>, drafts: Map<string, *> }>} collectionStore
 *   High-churn collection state, kept out of the context value so a write
 *   doesn't re-render every consumer. Slices, read via `useStoreSelector`:
 *   - `itemCache`: cache for `useCollectionItem`, keyed `"{key}:{slug}"`.
 *     Shared by page-side `<CollectionItem>` and the drawer's editor, so a
 *     drawer save reaches the page without a second fetch.
 *   - `listCache`: cache for `useCollection(key, params?)`, keyed
 *     `"{key}|{stableStringify(params)}"` so each filter/offset/limit window
 *     is its own entry.
 *   - `drafts`: in-progress editor edits keyed `"{key}:{slug}"`, pushed on
 *     every keystroke before the debounced autosave. `useCollectionItem` /
 *     `useCollection` overlay it onto `item.data` for live preview. Cleared
 *     on publish, undo, and pathname change.
 * @property {(key: string, slug: string, force?: boolean) => Promise<void>} requestCollectionItem
 *   Ensure a fresh cache entry for `(key, slug)`. Cache hit is a no-op unless
 *   `force`. Concurrent calls for the same pair are deduped in-flight.
 * @property {(key: string, slug: string, item: CollectionItemResponse) => void} updateCollectionItem
 *   Write a saved item into the cache without a refetch, so the page-side
 *   `<CollectionItem>` updates instantly. Invalidates every list window for
 *   the key so filtered views pick up membership changes.
 * @property {(key: string, slug: string, item: CollectionItemResponse) => void} patchCollectionItem
 *   Draft autosave / undo: write into the item cache and replace the matching
 *   row in every list window, without invalidating them. Safe because filters
 *   apply to published `data`, not `draftData`. Avoids a per-keystroke refetch
 *   storm and the race where a list refetch re-seeds the item from a
 *   not-yet-cleaned draft.
 * @property {(key: string, slug: string) => void} invalidateCollectionItem
 *   Drop the cache entry; the next mount refetches.
 * @property {(key: string, slug: string, payload: *) => void} setCollectionDraft
 * @property {(key: string, slug: string) => void} clearCollectionDraft
 * @property {() => void} clearCollectionDrafts
 * @property {(key: string, params?: import("./schemas.js").CollectionListParams, force?: boolean) => Promise<void>} requestCollectionList
 * @property {(key: string, params?: import("./schemas.js").CollectionListParams) => void} invalidateCollectionList
 *   With `params`: drop only that cache entry. Without `params`: drop
 *   every entry for the given collection (used after item save).
 */

/** @type {React.Context<CollectionContextValue|null>} */
export const CollectionContext = createContext(null);

/**
 * Read the current collection context. Throws if used outside
 * `<CollectionProvider>`.
 *
 * @returns {CollectionContextValue}
 */
export function useCollectionContext() {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    throw new Error(
      "Collection hooks/components must be used inside <CollectionProvider> " +
        "(mounted automatically by <CmsProvider>; in a future major it becomes " +
        "opt-in via the `collections` option of createCmsPage).",
    );
  }
  return ctx;
}