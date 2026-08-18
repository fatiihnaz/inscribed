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
 * `<CmsProvider>`, which takes it as the `collections` prop.
 */

import { createContext, useContext } from "react";

import { createStore } from "../shared/state/store.js";
import { stableStringify } from "../shared/util/stable-stringify.js";

/**
 * @import { MyCollectionResponse, CollectionItemResponse, CollectionVirtualItem, CollectionBinding } from "../shared/contracts/schemas.js"
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
 * @property {CollectionVirtualItem[]} virtualItems
 *   Rows with no record behind them yet. Normalised to `[]` rather than left
 *   absent, since every consumer would otherwise repeat the same guard.
 *
 *   Stored per window like the rest of the entry even though the server sends
 *   the same array to every window: the alternative, one collection-level slot,
 *   would need its own invalidation path and could go stale against the window
 *   that last fetched it.
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * `GET /cms/collections/me`, fetched once per session when `isAdmin` (empty for
 * public visitors). All drawer surfaces read schemas from here instead of
 * re-fetching /me per card.
 *
 * Indexed *and* ordered on purpose: cards look a single key up, while the
 * drawer's rail lists them in the order the server returned.
 *
 * @typedef {Object} CollectionMeta
 * @property {Map<string, MyCollectionResponse>} byKey
 * @property {MyCollectionResponse[]} order
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * Everything the collection namespace holds. All of it lives in one external
 * store rather than the context value, so a write re-renders only the
 * consumers selecting the slice that moved.
 *
 * @typedef {Object} CollectionStoreState
 * @property {Map<string, CollectionItemCacheEntry>} itemCache
 *   Cache for `useCollectionItem`, keyed `"{key}:{slug}"`. Shared by page-side
 *   `<CollectionItem>` and the drawer's editor, so a drawer save reaches the
 *   page without a second fetch.
 * @property {Map<string, CollectionListCacheEntry>} listCache
 *   Cache for `useCollection(key, params?)`, keyed
 *   `"{key}|{stableStringify(params)}"` so each filter/offset/limit window is
 *   its own entry.
 * @property {Map<string, *>} drafts
 *   In-progress editor edits keyed `"{key}:{slug}"`, pushed on every keystroke
 *   before the debounced autosave. `useCollectionItem` / `useCollection`
 *   overlay them onto `item.data` for live preview. Cleared on publish, undo,
 *   and pathname change.
 * @property {Map<string, string>} draftSavedAt
 * @property {Map<string, CollectionBinding>} bindings
 *   Runtime registry populated by `<CollectionItem>` / `<CollectionRegion>` on
 *   mount. Collections aren't in the CMS block namespace, so this is how the
 *   the admin drawer learns the bindings on the current page. Keyed by the binding's
 *   own identity (see `collectionItemBindingId` / `collectionRegionBindingId`);
 *   `slug` is set for items, omitted for list regions. Region bindings also
 *   carry filter/limit/offset so the drawer mirrors them.
 * @property {Map<string, string>} inlineFields
 *   Every record (`"{key}:{slug}"`) with `<CollectionField>`s mounted, mapped
 *   to the `<CollectionItem>` scope that drives its draft. One record can be
 *   open in several places at once (page fields, possibly twice over, plus the
 *   drawer's card) and they share one draft, so exactly one of them runs the
 *   autosave: presence here stands the drawer card down, and the scope named
 *   here is the page-side driver. Provider-level rather than per-item because
 *   the drawer is a sibling of the page tree, not a descendant.
 * @property {{ key: string, slug: string } | null} activeItem
 *   Drawer-side "open this row" signal. Set alongside the active tab when the
 *   StatusBar's "Aç" CTA targets an item; the matching card auto-expands on
 *   render, then clears it so revisiting the tab doesn't re-open the row.
 * @property {CollectionMeta} meta
 */

/**
 * Shape of the value held in `CollectionContext`.
 *
 * Seams only: every entry is identity-stable for the life of the provider, so
 * the value never changes after mount and no consumer re-renders because of it.
 * Anything that *moves* belongs in `collectionStore` and is read with
 * `useStoreSelector`. Guarded by tests/collections/context-split.test.jsx.
 *
 * @typedef {Object} CollectionContextValue
 * @property {import("../shared/state/store.js").Store<CollectionStoreState>} collectionStore
 * @property {(target: { key: string, slug: string } | null) => void} setActiveCollectionItem
 * @property {(bindingId: string, binding: CollectionBinding) => void} registerCollectionBinding
 *   Refcounted: the same binding registered twice is one entry, and the first
 *   registration's value wins.
 * @property {(bindingId: string) => void} unregisterCollectionBinding
 * @property {(collection: string, slug: string, scopeId: string) => void} registerInlineField
 * @property {(collection: string, slug: string, scopeId: string) => void} unregisterInlineField
 * @property {() => void} refetchMyCollections   Bump-token style; the provider re-runs the /me effect.
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
 * @property {(key: string, locale: string|null, draftData: *) => void} patchCollectionPendingDraft
 *   Composer autosave: write the new-item draft into the `pending` virtual row
 *   of every cached window for that language, inserting the row when the
 *   backend has not sent one yet. Without it the slot reads as empty until the
 *   next list fetch, so reopening the create pane loses the typed text.
 * @property {(key: string, slug: string) => void} invalidateCollectionItem
 *   Drop the cache entry; the next mount refetches.
 * @property {(key: string, slug: string, payload: *) => void} setCollectionDraft
 * @property {(key: string, slug: string) => void} clearCollectionDraft
 * @property {() => void} clearCollectionDrafts
 * @property {(key: string, slug: string, at: string | null) => void} setCollectionDraftSavedAt
 *   Clock of the last successful draft autosave, kept per record rather than
 *   per surface: only the driver runs the PUT, so a local copy would leave
 *   every other view of the record showing nothing for a draft that saved.
 *   `null` drops it, once the draft itself is gone.
 * @property {(key: string, params?: import("../shared/contracts/schemas.js").CollectionListParams, force?: boolean) => Promise<void>} requestCollectionList
 * @property {(key: string, params?: import("../shared/contracts/schemas.js").CollectionListParams) => void} invalidateCollectionList
 *   With `params`: drop only that cache entry. Without `params`: drop
 *   every entry for the given collection (used after item save).
 */

/** @type {React.Context<CollectionContextValue|null>} */
export const CollectionContext = createContext(null);

/**
 * Stand-in for `collectionStore` in an app that didn't opt into collections.
 * Never written, so every selector over it returns the same empty slice for
 * the life of the page.
 *
 * The drawer is the one surface that renders either way and reads these slices
 * unconditionally (bindings, caches, drafts all feed its dirty counts). Handing
 * it this store keeps those reads honest without a null branch per selector.
 *
 * @type {import("../shared/state/store.js").Store<CollectionStoreState>}
 */
export const EMPTY_COLLECTION_STORE = createStore({
  itemCache: new Map(),
  listCache: new Map(),
  drafts: new Map(),
  draftSavedAt: new Map(),
  bindings: new Map(),
  inlineFields: new Map(),
  createLanes: new Map(),
  editorValues: new Map(),
  activeItem: null,
  meta: { byKey: new Map(), order: [], isLoading: false, error: null },
});

/**
 * The collection context, or null when the app didn't pass `collections` to
 * `<CmsProvider>`. Only the drawer needs this: it renders for both kinds of app
 * and hides its collection surfaces when there is nothing behind them.
 * Everything else uses `useCollectionContext`, where absence is a wiring bug.
 *
 * @returns {CollectionContextValue | null}
 */
export function useOptionalCollectionContext() {
  return useContext(CollectionContext);
}

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
      "Collection hooks/components must be used inside <CollectionProvider>. " +
        "Opt in by passing it to your provider: <CmsProvider collections={CollectionProvider}>, " +
        "or via createCmsPage({ collections: { CollectionProvider, CollectionRecord, CollectionRows } }). " +
        "Import CollectionProvider from \"inscribed/collections\".",
    );
  }
  return ctx;
}