"use client";

/**
 * @file Internal CMS React context. Wired by `CmsProvider`, consumed by hooks
 * via `useCmsContext`. Lives in `shared/` because every layer above reads it:
 * putting it beside its provider in `core/` would have the editors, the
 * collections namespace and the drawer all importing upward.
 *
 * The value carries **seams, not state**: config, the admin gate, callbacks,
 * and handles to the stores. Everything that changes while the app runs lives
 * in one of those stores and is read through `useStoreSelector`, so a write
 * reaches exactly the components that select the changed slice. Nothing here
 * changes identity after the session resolves, which is what keeps a keystroke
 * (or a save, or an open panel) from re-rendering the page tree.
 */

import { createContext, useContext } from "react";

/**
 * @import { CmsConfig } from "../config.js"
 * @import { BlockResponse, ItemSchema } from "../contracts/schemas.js"
 * @import { Store } from "./store.js"
 */

/**
 * Transient editor UI, one store so a single write can move two related fields
 * (closing the drawer also drops the active block).
 *
 * @typedef {Object} CmsUiState
 * @property {string|null} activeBlock
 *   Block the drawer has open. Regions select `s.activeBlock === path` so a
 *   selection change re-renders the two rows involved, not every region.
 * @property {{ path: string, index: number } | null} activeListItem
 *   Drawer-side "open this list row" signal (List-block analogue of
 *   `activeCollectionItem`). Set when a page-side `<EditableList>` item is
 *   clicked; the matching `ListItemCard` auto-expands and scrolls into view,
 *   then clears it so it fires once.
 * @property {boolean} isDrawerOpen
 * @property {"idle"|"saving"|"saved"|"failed"} draftSyncStatus
 *   Background `PUT /cms/draft` autosave state. `saved`/`failed` are transient
 *   pulses that clear back to `idle` after the status dot finishes flashing.
 * @property {Set<string>} conflictBlocks
 *   Blocks a save was refused over, from the 409's `conflicts` extension. Cards
 *   select membership as a boolean, so a conflict re-renders only the blocks it
 *   names. The refetch that follows the 409 puts the other editor's value back
 *   in `block.value` while the local draft still holds the user's, which is
 *   what the card's resolve panel diffs.
 * @property {number} refetchToken   Bumped to force `useCmsContent` to refetch.
 */

/**
 * Runtime declarations the page makes and the drawer consumes. Registered from
 * child effects, which is why this is a store: a `setState` during another
 * component's commit would warn, and the drawer is the only reader anyway.
 *
 * @typedef {Object} CmsRegistryState
 * @property {Map<string, ItemSchema>} itemSchemas
 *   Populated by `<EditableList>` on mount so the drawer knows how to render
 *   each List editor. Key is the list's blockPath; unregistered on unmount.
 * @property {Map<string, "hidden"|"readonly">} editorVisibility
 *   Populated by regions whose `visible` / `editable` prop overrides the
 *   default admin gate. These props are runtime-only (not in the manifest), so
 *   this is how the drawer learns them. `"hidden"` drops the block from the
 *   drawer; `"readonly"` keeps the card but locks it.
 */

/**
 * Shape of the value held in `CmsContext`.
 *
 * Collection-namespace state lives in `CollectionContext`
 * (see `collections/context.js`), not here.
 *
 * @typedef {Object} CmsContextValue
 * @property {CmsConfig} config
 * @property {boolean} isAdmin
 * @property {string|null} userSub
 * @property {{ name: string|null, email: string|null, image: string|null } | null} userInfo  Admin-only: identity for the panel footer. Null when no session.
 * @property {(() => void) | null} onSignOut  Admin-only: invoked by the panel's logout button. Null when no auth wiring.
 *
 * @property {Store<Map<string, Map<string, BlockResponse>>>} blocksStore
 *   Blocks keyed by slug, then by blockPath, and it keeps every route visited
 *   this session. Consumers select through their own pathname
 *   (`s.get(slug)?.get(path)`), which is what makes a return visit paint
 *   instantly: the moment the route commits, the selector already resolves
 *   against the blocks fetched last time, with no effect in between to leave a
 *   frame of placeholders. Regions select a single entry so one block's autosave
 *   roundtrip doesn't re-render the rest; the drawer and `useCmsSave` select the
 *   whole map for their route because they aggregate over it.
 * @property {(slug: string, blocks: Map<string, BlockResponse>) => void} commitBlocks
 *   Replace one route's blocks, as `useCmsContent` does once a fetch lands.
 *   Other routes' entries stay: that is the cache.
 * @property {Store<Map<string, *>>} contentDraftsStore
 *   Per-blockPath unsaved edits (live-preview overlay while typing). Regions
 *   subscribe to their own blockPath; the drawer and `useCmsSave` to the whole
 *   map. Cleared on save/discard/navigation.
 * @property {(blockPath: string, value: *) => void} setDraft
 * @property {(blockPath: string) => void} clearDraft
 * @property {() => void} clearDrafts
 * @property {(blockPaths: string[]) => void} settleDraftWrites
 *   Stand these blocks' slug lanes down after a publish: mark an in-flight
 *   autosave stale so it can't mirror a `draftValue` back over what was just
 *   published, and queue a cleanup DELETE behind it. The DELETE is chained, so
 *   it goes out only once a draft PUT already on the wire has come back, which
 *   is what stops that PUT re-creating the slot the publish cleared.
 * @property {(blockPaths: string[]) => void} discardServerDrafts
 *   Silently clean up server-side draft slots: optimistically null `draftValue`
 *   locally (dirty count drops at once) and fire cleanup DELETEs in the
 *   background without touching `draftSyncStatus`, so discard doesn't flash a
 *   save pulse.
 * @property {Store<CmsUiState>} uiStore
 * @property {(paths: string[]) => void} setBlockConflicts
 *   Replace the conflicting-block set, from a 409's `conflicts` extension.
 * @property {(blockPath: string) => void} clearBlockConflict
 *   Drop one block once the user has picked a side.
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {(target: { path: string, index: number } | null) => void} setActiveListItem
 * @property {(open: boolean) => void} setDrawerOpen
 * @property {() => void} triggerRefetch
 * @property {Store<CmsRegistryState>} registryStore
 * @property {(blockPath: string, schema: ItemSchema) => void} registerItemSchema
 * @property {(blockPath: string) => void} unregisterItemSchema
 * @property {(blockPath: string, mode: "hidden"|"readonly") => void} registerEditorVisibility
 * @property {(blockPath: string) => void} unregisterEditorVisibility
 *
 * @property {((slug: string) => void | Promise<void>) | null} onAfterSave  Called after a successful save (typically a Server Action that calls `revalidateTag(cmsCacheTag(slug))`).
 * @property {(key: string, slug?: string) => Promise<void>} onAfterCollectionSave
 *   Called after a collection record is published, typically a Server Action
 *   running `revalidateCmsCollection`. Required once collections are rendered on
 *   the server: without it a publish leaves the ISR cache serving the old row.
 * @property {(() => Promise<string>) | null} getAccessToken  Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Null in public/demo mode.
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
