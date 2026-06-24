"use client";

/**
 * @file Internal CMS React context. Wired by `CmsProvider`, consumed by hooks
 * via `useCmsContext`. Lives in `lib/` so provider and hooks both import it
 * without a circular dependency through the components barrel.
 */

import { createContext, useContext } from "react";

/**
 * @import { CmsConfig } from "./config.js"
 * @import { BlockResponse, ItemSchema } from "./schemas.js"
 */

/**
 * Shape of the value held in `CmsContext`.
 *
 * Collection-namespace state lives in `CollectionContext`
 * (see `collection-context.js`), not here.
 *
 * @typedef {Object} CmsContextValue
 * @property {CmsConfig} config
 * @property {boolean} isAdmin
 * @property {string|null} userSub
 * @property {Map<string, BlockResponse>} blocks
 * @property {(updater: (prev: Map<string, BlockResponse>) => Map<string, BlockResponse>) => void} setBlocks
 * @property {import("./store.js").Store<Map<string, *>>} contentDraftsStore
 *   Per-blockPath unsaved edits (live-preview overlay while typing), kept out
 *   of this value so a keystroke doesn't re-render every consumer. Regions
 *   subscribe to their own blockPath; the drawer and `useCmsSave` to the whole
 *   map. Cleared on save/discard/navigation.
 * @property {(blockPath: string, value: *) => void} setDraft
 * @property {(blockPath: string) => void} clearDraft
 * @property {() => void} clearDrafts
 * @property {(blockPaths: string[]) => void} discardServerDrafts
 *   Silently clean up server-side draft slots: optimistically null `draftValue`
 *   locally (dirty count drops at once) and fire cleanup PUTs in the background
 *   without touching `draftSyncStatus`, so discard doesn't flash a save pulse.
 * @property {string|null} activeBlock
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {{ path: string, index: number } | null} activeListItem
 *   Drawer-side "open this list row" signal (List-block analogue of
 *   `activeCollectionItem`). Set when a page-side `<EditableList>` item is
 *   clicked; the matching `ListItemCard` auto-expands and scrolls into view,
 *   then clears it so it fires once.
 * @property {(target: { path: string, index: number } | null) => void} setActiveListItem
 * @property {number} refetchToken      Bumped to force `useCmsContent` to refetch.
 * @property {() => void} triggerRefetch
 * @property {Map<string, ItemSchema>} itemSchemas
 *   Registry populated by `<EditableList>` on mount so the AdminDrawer knows
 *   how to render each List editor. Key is the list's blockPath; unregistered
 *   on unmount.
 * @property {(blockPath: string, schema: ItemSchema) => void} registerItemSchema
 * @property {(blockPath: string) => void} unregisterItemSchema
 * @property {Map<string, "hidden"|"readonly">} editorVisibility
 *   Registry populated by `<EditableRegion>` instances whose `visible` /
 *   `editable` prop overrides the default admin gate. These props are
 *   runtime-only (not in the manifest), so this is how the AdminDrawer learns
 *   them. `"hidden"` drops the block from the drawer; `"readonly"` keeps the
 *   card but locks it. Key is the block's full path; unregistered on unmount.
 * @property {(blockPath: string, mode: "hidden"|"readonly") => void} registerEditorVisibility
 * @property {(blockPath: string) => void} unregisterEditorVisibility
 * @property {((slug: string) => void | Promise<void>) | null} onAfterSave  Called after a successful save (typically a Server Action that calls `revalidateTag(cmsCacheTag(slug))`).
 * @property {(() => Promise<string>) | null} getAccessToken  Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Null in public/demo mode.
 * @property {"idle"|"saving"|"saved"|"failed"} draftSyncStatus
 *   Background `PUT /cms/draft` autosave state. `saved`/`failed` are transient
 *   pulses that clear back to `idle` after the status dot finishes flashing.
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