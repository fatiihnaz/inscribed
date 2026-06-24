"use client";

/**
 * @file Internal Collections React context.
 *
 * Holds the entire collection namespace - the item/list cache store, the
 * bindings registry, the `/me` schemas, and the request/draft handlers -
 * separately from the core {@link import("./context.js").CmsContext}. The
 * `CollectionProvider` component (in `components/CollectionProvider.jsx`)
 * wires this up; collection hooks (`useCollection`, `useCollectionItem`,
 * `useMyCollections`) and components (`<CollectionRegion>`,
 * `<CollectionItem>`) consume it via `useCollectionContext`.
 *
 * Kept apart from the CMS block state on purpose: collections are an
 * opt-in capability (imported from `inscribed/collections`), and the core
 * editor must not depend on this layer. The provider reads `config`,
 * `isAdmin`, and `getAccessToken` back out of `CmsContext`, so it must be
 * mounted *inside* `<CmsProvider>`.
 */

import { createContext, useContext } from "react";

/**
 * @import { MyCollectionResponse, CollectionItemResponse } from "./schemas.js"
 */

/**
 * @typedef {Object} CollectionItemCacheEntry
 * @property {CollectionItemResponse | null} item
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * Single page of `useCollection` data. Each (collection, params) tuple
 * has its own entry so the same collection viewed through different
 * filter / pagination windows doesn't share state.
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
 *   Drawer-side "open this row" signal consumed by `RegionItemCard`.
 *   When the StatusBar's "Aç" CTA targets a specific collection item, this
 *   is set alongside switching the active tab; the matching card reads it
 *   on render and auto-expands. The card clears the signal after honouring
 *   it so re-visiting the same tab later doesn't re-open the row.
 * @property {(target: { key: string, slug: string } | null) => void} setActiveCollectionItem
 * @property {Map<string, { collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }>} collectionBindings
 *   Runtime registry populated by `<CollectionItem>` and `<CollectionRegion>`
 *   when they mount. Collections don't live in the CMS block namespace
 *   (no manifest sync, no `/cms/content` payload), so this is how the
 *   AdminDrawer learns about the bindings rendered on the current page.
 *   Key is the binding's full blockPath (with any `<CmsGroup>` prefix
 *   applied); slug is set for `<CollectionItem>` and omitted for
 *   `<CollectionRegion>` (list bindings). Region bindings additionally
 *   carry the filter / limit / offset the page is using so the drawer
 *   can mirror its data (filter parity).
 * @property {(blockPath: string, binding: { collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }) => void} registerCollectionBinding
 * @property {(blockPath: string) => void} unregisterCollectionBinding
 * @property {MyCollectionResponse[]} myCollections
 *   Response of `GET /cms/collections/me`, fetched once per session by
 *   the provider when `isAdmin === true` (empty array for public
 *   visitors). All admin drawer surfaces (Collection block cards,
 *   per-collection tabs) read schemas from here so we don't re-fetch
 *   /me per card.
 * @property {boolean} myCollectionsLoading
 * @property {Error|null} myCollectionsError
 * @property {() => void} refetchMyCollections   Bump-token style; the provider re-runs the /me effect.
 * @property {import("./store.js").Store<{ itemCache: Map<string, CollectionItemCacheEntry>, listCache: Map<string, CollectionListCacheEntry>, drafts: Map<string, *> }>} collectionStore
 *   External store holding the high-churn collection state, kept OUT of
 *   this context value so a write doesn't re-render every consumer (React
 *   context has no per-field subscription). Slices:
 *   - `itemCache` - shared cache for `useCollectionItem`, keyed
 *     `"{key}:{slug}"`. Both the page-side `<CollectionItem>` and the
 *     drawer-side `AdminCollectionEditor` read it, so a save in the drawer
 *     propagates to the page without a second fetch (and two surfaces
 *     mounted at once for the same item fire one request).
 *   - `listCache` - shared cache for `useCollection(key, params?)`, keyed
 *     `"{key}|{stableStringify(params ?? {})}"` so different filter /
 *     offset / limit windows live as separate entries.
 *   - `drafts` - per-(collection, slug) in-progress local edits from open
 *     editors, keyed `"{key}:{slug}"`; the live-preview payload the editor
 *     pushes on every keystroke (before the debounced server autosave).
 *     `useCollectionItem` / `useCollection` overlay it onto `item.data` so
 *     page-side consumers see edits live. Cleared on publish, "undo", and
 *     pathname change (so soft-nav doesn't leak stale overlays).
 *   Consumers read narrow slices via `useStoreSelector(collectionStore, ...)`.
 * @property {(key: string, slug: string, force?: boolean) => Promise<void>} requestCollectionItem
 *   Ensure the cache holds a fresh entry for `(key, slug)`. Cache hit ->
 *   no-op (unless `force === true`). Concurrent calls for the same pair
 *   are deduped via an in-flight promise table.
 * @property {(key: string, slug: string, item: CollectionItemResponse) => void} updateCollectionItem
 *   Write a freshly-saved item straight into the cache, bypassing a
 *   refetch. Called by the drawer's save handler so the page-side
 *   `<CollectionItem>` re-renders with the new version instantly.
 *   Invalidates every list-cache window for the key, so filtered views
 *   pick up filter-membership changes via refetch.
 * @property {(key: string, slug: string, item: CollectionItemResponse) => void} patchCollectionItem
 *   In-place patch for draft autosave / undo: writes the item into the
 *   item cache AND replaces the matching row inside every list-cache
 *   window for the key, without invalidating those windows. Safe when
 *   the row's filter membership can't change (filters apply to published
 *   `data`, not `draftData`). Avoids a refetch storm on every keystroke
 *   and the race where the list refetch re-seeds the item cache from
 *   the server's not-yet-cleaned-up draft state.
 * @property {(key: string, slug: string) => void} invalidateCollectionItem
 *   Drop the cache entry; the next consumer mount triggers a fresh fetch.
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