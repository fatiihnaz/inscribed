"use client";

/**
 * @file Top-level provider that owns CMS context state.
 *
 * Mount once near the root (e.g. in `app/layout.jsx`). Holds the blocks
 * map, active-block selection, and the refetch token. Admin-only UI
 * (the drawer) is lazy-loaded so public visitors don't pay for it.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { CmsContext } from "../lib/context.js";
import { createCmsConfig } from "../lib/config.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { useCmsContent } from "../hooks/use-cms-content.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse } from "../lib/schemas.js"
 */

const AdminDrawer = dynamic(
  () => import("./AdminDrawer.jsx").then((m) => m.AdminDrawer),
  { ssr: false },
);

/**
 * @param {Object} props
 * @param {CmsConfig | { baseUrl: string, clientId?: string, clientSecret?: string }} props.config
 * @param {string|null} [props.userSub]
 * @param {boolean} [props.isAdmin]
 * @param {BlockResponse[]} [props.initialBlocks]   Server-fetched blocks for the active page; eliminates the SSR fallback flicker by seeding the blocks map before first paint.
 * @param {(slug: string) => void | Promise<void>} [props.onAfterSave]   Server Action invoked after a successful save (typically calls `revalidateTag(cmsCacheTag(slug))` to drop stale ISR data).
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Omit in public/demo mode.
 * @param {React.ReactNode} props.children
 */
export function CmsProvider({
  config,
  userSub = null,
  isAdmin = false,
  initialBlocks,
  onAfterSave,
  getAccessToken,
  children,
}) {
  // Accept either a raw `{ baseUrl }` shape or a pre-built CmsConfig.
  const normalizedConfig = useMemo(
    () => "baseUrl" in config && Object.isFrozen(config) ? /** @type {CmsConfig} */ (config) : createCmsConfig(config),
    [config],
  );

  // Seed the blocks map from `initialBlocks` so EditableRegion has real
  // values to render during SSR and on first client paint. Subsequent
  // updates flow through `useCmsContent` (refetch on mount) and saves.
  const [blocks, setBlocksState] = useState(
    /** @returns {Map<string, BlockResponse>} */
    () => indexBlocksByPath(initialBlocks ?? []),
  );
  const [activeBlock, setActiveBlock] = useState(
    /** @type {string|null} */ (null),
  );
  const [refetchToken, setRefetchToken] = useState(0);

  // Stash callbacks in refs so changes to the props don't bust the
  // memoised context value (server actions are stable references in
  // practice, but refs guarantee no spurious re-renders).
  const onAfterSaveRef = useRef(onAfterSave ?? null);
  onAfterSaveRef.current = onAfterSave ?? null;

  const getAccessTokenRef = useRef(getAccessToken ?? null);
  getAccessTokenRef.current = getAccessToken ?? null;

  const setBlocks = useCallback(
    /**
     * @param {(prev: Map<string, BlockResponse>) => Map<string, BlockResponse>} updater
     */
    (updater) => {
      setBlocksState((prev) => updater(prev));
    },
    [],
  );

  const triggerRefetch = useCallback(() => {
    setRefetchToken((n) => n + 1);
  }, []);

  // Public-mode visitors should not be able to enter edit state at all.
  const setActiveBlockGuarded = useCallback(
    /** @param {string|null} blockPath */
    (blockPath) => {
      if (!isAdmin) return;
      setActiveBlock(blockPath);
    },
    [isAdmin],
  );

  const stableOnAfterSave = useCallback(
    /** @param {string} slug */
    async (slug) => {
      const fn = onAfterSaveRef.current;
      if (!fn) return;
      await fn(slug);
    },
    [],
  );

  const stableGetAccessToken = useCallback(
    /** @returns {Promise<string>} */
    async () => {
      const fn = getAccessTokenRef.current;
      if (!fn) return "";
      return fn();
    },
    [],
  );

  const value = useMemo(
    () => ({
      config: normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      setBlocks,
      activeBlock,
      setActiveBlock: setActiveBlockGuarded,
      refetchToken,
      triggerRefetch,
      onAfterSave: stableOnAfterSave,
      getAccessToken: stableGetAccessToken,
    }),
    [
      normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      setBlocks,
      activeBlock,
      setActiveBlockGuarded,
      refetchToken,
      triggerRefetch,
      stableOnAfterSave,
      stableGetAccessToken,
    ],
  );

  return (
    <CmsContext.Provider value={value}>
      {isAdmin ? <ContentLoader /> : null}
      {children}
      {isAdmin ? <AdminDrawer /> : null}
    </CmsContext.Provider>
  );
}

// Public visitors render entirely from `initialBlocks` (server-fetched and
// ISR-cached under `cmsCacheTag(slug)`); the cache is dropped on admin save
// via `revalidateCmsSlug`, so there is no reason to re-verify on every page
// view. Admin sessions still mount this so post-save `triggerRefetch` can
// pull fresh versions into the editor's view without a navigation.
function ContentLoader() {
  useCmsContent();
  return null;
}
