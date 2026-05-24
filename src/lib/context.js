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
 * @import { BlockResponse, ItemSchema, MyCollectionResponse } from "./schemas.js"
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
 * @property {Map<string, *>} drafts                 Per-blockPath unsaved edits; EditableRegion reads these for live preview while admins type.
 * @property {(blockPath: string, value: *) => void} setDraft
 * @property {(blockPath: string) => void} clearDraft
 * @property {() => void} clearDrafts
 * @property {string|null} activeBlock
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {number} refetchToken      Bumped to force `useCmsContent` to refetch.
 * @property {() => void} triggerRefetch
 * @property {Map<string, ItemSchema>} itemSchemas
 *   Registry populated by `<EditableList>` instances at mount time. The
 *   AdminDrawer reads it to know how to render List editors (per-field
 *   atomic editors). Unregistered on unmount; key is the list's blockPath.
 * @property {(blockPath: string, schema: ItemSchema) => void} registerItemSchema
 * @property {(blockPath: string) => void} unregisterItemSchema
 * @property {Map<string, { collection: string, slug?: string }>} collectionBindings
 *   Runtime registry populated by `<CollectionItem>` and `<CollectionRegion>`
 *   when they mount. Collections don't live in the CMS block namespace
 *   (no manifest sync, no `/cms/content` payload), so this is how the
 *   AdminDrawer learns about the bindings rendered on the current page.
 *   Key is the binding's full blockPath (with any `<CmsGroup>` prefix
 *   applied); slug is set for `<CollectionItem>` and omitted for
 *   `<CollectionRegion>` (list bindings).
 * @property {(blockPath: string, binding: { collection: string, slug?: string }) => void} registerCollectionBinding
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