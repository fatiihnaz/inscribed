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
 * @import { BlockResponse } from "./schemas.js"
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
 * @property {string|null} activeBlock
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {number} refetchToken      Bumped to force `useCmsContent` to refetch.
 * @property {() => void} triggerRefetch
 * @property {((slug: string) => void | Promise<void>) | null} onAfterSave  Called after a successful save (typically a Server Action that calls `revalidateTag(cmsCacheTag(slug))`).
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