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
 * @import { BlockResponse, ItemSchema } from "./schemas.js"
 */

/**
 * Shape of the value held in `CmsContext`.
 *
 * Collection-namespace state (item/list cache, bindings registry, /me
 * schemas, request/draft handlers) is NOT here - it lives in
 * `CollectionContext` (see `collection-context.js`), supplied by
 * `<CollectionProvider>`.
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