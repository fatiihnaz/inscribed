"use client";

/**
 * @file Internal CMS React context.
 *
 * The `CmsProvider` component (in `components/CmsProvider.jsx`) wires this
 * up; hooks under `src/hooks/` consume it via `useCmsContext`. Kept in
 * `lib/` so both the provider and the hooks can import it without a
 * circular dependency through the components barrel.
 */

import { createContext, useContext } from "react";

/**
 * @import { CmsConfig } from "./config.js"
 * @import { BlockResponse, ItemSchema, MyCollectionResponse, CollectionItemResponse } from "./schemas.js"
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
 * Shape of the value held in `CmsContext`.
 *
 * @typedef {Object} CmsContextValue
 * @property {CmsConfig} config
 * @property {boolean} isAdmin
 * @property {string|null} userSub
 * @property {Map<string, BlockResponse>} blocks
 * @property {(updater: (prev: Map<string, BlockResponse>) => Map<string, BlockResponse>) => void} setBlocks
 * @property {import("./store.js").Store<Map<string, *>>} contentDraftsStore
 *   External store of per-blockPath unsaved edits (live-preview overlay
 *   while admins type), kept OUT of this value so a keystroke doesn't
 *   re-render every consumer. `<EditableRegion>` / `<EditableList>`
 *   subscribe to their own blockPath via `useStoreSelector`; the drawer and
 *   `useCmsSave` subscribe to the whole map. Cleared on save / discard /
 *   navigation.
 * @property {(blockPath: string, value: *) => void} setDraft
 * @property {(blockPath: string) => void} clearDraft
 * @property {() => void} clearDrafts
 * @property {(blockPaths: string[]) => void} discardServerDrafts
 *   Silent cleanup of server-side draft slots for the given block paths.
 *   Optimistically nulls `draftValue` on those blocks in the local map
 *   (dirty count drops to 0 immediately) and fires per-slug cleanup PUTs
 *   in the background without touching `draftSyncStatus`. Used by the
 *   discard flow so the header pill / status bar don't flash a save
 *   pulse for a request that conceptually removes a draft.
 * @property {string|null} activeBlock
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {{ key: string, slug: string } | null} activeCollectionItem
 *   Drawer-side "open this row" signal consumed by `RegionItemCard`.
 *   When the StatusBar's "Aç" CTA targets a specific collection item, this
 *   is set alongside switching the active tab; the matching card reads it
 *   on render and auto-expands. The card clears the signal after honouring
 *   it so re-visiting the same tab later doesn't re-open the row.
 * @property {(target: { key: string, slug: string } | null) => void} setActiveCollectionItem
 * @property {{ path: string, index: number } | null} activeListItem
 *   Drawer-side "open this list row" signal, the List-block analogue of
 *   `activeCollectionItem`. Set when a page-side `<EditableList>` item is
 *   clicked (alongside `setActiveBlock` for the List card itself); the
 *   matching `ListItemCard` reads it on render, auto-expands, scrolls into
 *   view, then clears the signal so it only fires once.
 * @property {(target: { path: string, index: number } | null) => void} setActiveListItem
 * @property {number} refetchToken      Bumped to force `useCmsContent` to refetch.
 * @property {() => void} triggerRefetch
 * @property {Map<string, ItemSchema>} itemSchemas
 *   Registry populated by `<EditableList>` instances at mount time. The
 *   AdminDrawer reads it to know how to render List editors (per-field
 *   atomic editors). Unregistered on unmount; key is the list's blockPath.
 * @property {(blockPath: string, schema: ItemSchema) => void} registerItemSchema
 * @property {(blockPath: string) => void} unregisterItemSchema
 * @property {Map<string, "hidden"|"readonly">} editorVisibility
 *   Registry populated by `<EditableRegion>` instances whose `visible` /
 *   `editable` prop overrides the default admin gate. These props live in
 *   page-side JSX (runtime only — they're not in the manifest or the
 *   `/cms/content` blocks map), so this is how the AdminDrawer learns about
 *   them. `"hidden"` (from `visible={false}`) drops the block from the
 *   drawer entirely; `"readonly"` (from `editable={false}`) keeps the card
 *   but renders it locked. Key is the block's full path (with any
 *   `<CmsGroup>` prefix applied). Unregistered on unmount.
 * @property {(blockPath: string, mode: "hidden"|"readonly") => void} registerEditorVisibility
 * @property {(blockPath: string) => void} unregisterEditorVisibility
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
 *   future per-collection tabs) read schemas from here so we don't
 *   re-fetch /me per card.
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
 * @property {((slug: string) => void | Promise<void>) | null} onAfterSave  Called after a successful save (typically a Server Action that calls `revalidateTag(cmsCacheTag(slug))`).
 * @property {(() => Promise<string>) | null} getAccessToken  Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Null in public/demo mode.
 * @property {"idle"|"saving"|"saved"|"failed"} draftSyncStatus
 *   Background `PUT /cms/draft` autosave state. `saved`/`failed` are
 *   transient pulse signals - they clear back to `idle` after the panel's
 *   status dot finishes its flash animation.
 * @property {boolean} isDrawerOpen      Admin-only: whether the editor drawer is expanded.
 * @property {(open: boolean) => void} setDrawerOpen  Admin-only: toggle the drawer.
 * @property {{ name: string|null, email: string|null, image: string|null } | null} userInfo  Admin-only: identity to display in the panel footer. Null when no session.
 * @property {(() => void) | null} onSignOut  Admin-only: invoked by the panel's logout button. Null when no auth wiring.
 */

/** @type {React.Context<CmsContextValue|null>} */
export const CmsContext = createContext(null);

/**
 * Read the current CMS context. Throws if used outside `<CmsProvider>`.
 *
 * @returns {CmsContextValue}
 */
export function useCmsContext() {
  const ctx = useContext(CmsContext);
  if (!ctx) {
    throw new Error(
      "CMS hooks/components must be used inside <CmsProvider>",
    );
  }
  return ctx;
}