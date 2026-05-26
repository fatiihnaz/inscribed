"use client";

/**
 * @file Top-level provider that owns CMS context state.
 *
 * Mount once near the root (e.g. in `app/layout.jsx`). Holds the blocks
 * map, active-block selection, and the refetch token. Admin-only UI
 * (the drawer) is lazy-loaded so public visitors don't pay for it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { CmsContext } from "../lib/context.js";
import { createCmsConfig } from "../lib/config.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { updateDraft, fetchMyCollections, fetchCollectionItem, fetchCollection } from "../lib/api-client.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { useCmsContent } from "../hooks/use-cms-content.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse, ItemSchema } from "../lib/schemas.js"
 */

const AdminDrawer = dynamic(
  () => import("./AdminDrawer.jsx").then((m) => m.AdminDrawer),
  { ssr: false },
);

/**
 * @param {Object} props
 * @param {CmsConfig | { baseUrl: string, clientId?: string }} props.config
 * @param {string|null} [props.userSub]
 * @param {boolean} [props.isAdmin]
 * @param {BlockResponse[]} [props.initialBlocks]   Server-fetched blocks for the active page; eliminates the SSR fallback flicker by seeding the blocks map before first paint.
 * @param {(slug: string) => void | Promise<void>} [props.onAfterSave]   Server Action invoked after a successful save (typically calls `revalidateTag(cmsCacheTag(slug))` to drop stale ISR data).
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Omit in public/demo mode.
 * @param {{ name: string|null, email: string|null, image: string|null } | null} [props.userInfo]   Identity for the admin panel footer. Null in public/demo mode.
 * @param {() => void} [props.onSignOut]   Invoked by the admin panel's logout button.
 * @param {React.ReactNode} props.children
 */
export function CmsProvider({
  config,
  userSub = null,
  isAdmin = false,
  initialBlocks,
  onAfterSave,
  getAccessToken,
  userInfo = null,
  onSignOut,
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Per-blockPath unsaved edits. Lives here (rather than in AdminDrawer) so
  // EditableRegion can read live draft values for inline preview while the
  // user types. Cleared on save / discard / navigation.
  const [drafts, setDraftsState] = useState(
    /** @returns {Map<string, *>} */ (() => new Map()),
  );

  // Registry of <EditableList> itemSchemas so the AdminDrawer can render
  // List editors. Lives in a ref + a forced rerender counter rather than
  // setState - register/unregister fires inside child useEffects, which
  // would otherwise schedule a parent setState mid-commit and warn.
  const itemSchemasRef = useRef(/** @type {Map<string, ItemSchema>} */ (new Map()));
  const [itemSchemasVersion, setItemSchemasVersion] = useState(0);

  const registerItemSchema = useCallback(
    /** @param {string} blockPath @param {ItemSchema} schema */
    (blockPath, schema) => {
      itemSchemasRef.current.set(blockPath, schema);
      setItemSchemasVersion((n) => n + 1);
    },
    [],
  );

  const unregisterItemSchema = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      if (!itemSchemasRef.current.delete(blockPath)) return;
      setItemSchemasVersion((n) => n + 1);
    },
    [],
  );

  // Registry of `<CollectionItem>` / `<CollectionRegion>` bindings.
  // Collections don't live in the manifest (no CMS block namespace), so
  // the drawer learns about them via this runtime registry. State-based
  // (new Map identity on each change) so consumers' useMemo deps
  // recompute naturally when bindings come or go.
  const [collectionBindings, setCollectionBindings] = useState(
    /** @returns {Map<string, { collection: string, slug?: string }>} */
    () => new Map(),
  );

  const registerCollectionBinding = useCallback(
    /** @param {string} blockPath @param {{ collection: string, slug?: string }} binding */
    (blockPath, binding) => {
      setCollectionBindings((prev) => {
        const existing = prev.get(blockPath);
        if (
          existing &&
          existing.collection === binding.collection &&
          existing.slug === binding.slug
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(blockPath, binding);
        return next;
      });
    },
    [],
  );

  const unregisterCollectionBinding = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setCollectionBindings((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
        return next;
      });
    },
    [],
  );

  // /cms/collections/me state - effect fires further down (after
  // `stableGetAccessToken` is declared) so the drawer's per-Collection
  // cards (and future per-Collection tabs) share a single round-trip
  // instead of each mounting its own fetch.
  const [myCollectionsState, setMyCollectionsState] = useState(
    /** @returns {{ data: import("../lib/schemas.js").MyCollectionResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ data: [], isLoading: false, error: null }),
  );
  const [myCollectionsToken, setMyCollectionsToken] = useState(0);
  const refetchMyCollections = useCallback(() => {
    setMyCollectionsToken((n) => n + 1);
  }, []);

  // Shared collection-item cache. Keyed by `"{collectionKey}:{slug}"`.
  // `useCollectionItem` consumers read entries directly; the request /
  // update / invalidate callbacks below mutate the map (new identity
  // each change so consumer useMemo deps recompute).
  const [collectionItemCache, setCollectionItemCache] = useState(
    /** @returns {Map<string, import("../lib/context.js").CollectionItemCacheEntry>} */
    () => new Map(),
  );
  // In-flight promises - lives in a ref so concurrent `requestCollectionItem`
  // calls dedupe to a single fetch without going through state updates.
  const inFlightCollectionItems = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  // List cache for `useCollection(key)`. Keyed by collection key.
  const [collectionListCache, setCollectionListCache] = useState(
    /** @returns {Map<string, import("../lib/context.js").CollectionListCacheEntry>} */
    () => new Map(),
  );
  const inFlightCollectionLists = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  const updateCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {import("../lib/schemas.js").CollectionItemResponse} item */
    (key, slug, item) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, { item, isLoading: false, error: null });
        return next;
      });
      // Mirror into the list cache: replace the matching row if present,
      // append if missing (covers POST-create when the new slug isn't in
      // the cached list yet). Lists not in cache are left alone.
      setCollectionListCache((prev) => {
        const entry = prev.get(key);
        if (!entry) return prev;
        const idx = entry.items.findIndex((row) => row.slug === slug);
        const items = entry.items.slice();
        if (idx === -1) items.push(item);
        else items[idx] = item;
        const next = new Map(prev);
        next.set(key, { ...entry, items });
        return next;
      });
    },
    [],
  );

  const invalidateCollectionItem = useCallback(
    /** @param {string} key @param {string} slug */
    (key, slug) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        if (!prev.has(cacheKey)) return prev;
        const next = new Map(prev);
        next.delete(cacheKey);
        return next;
      });
    },
    [],
  );

  const invalidateCollectionList = useCallback(
    /** @param {string} key */
    (key) => {
      setCollectionListCache((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  // Sync the blocks map when `initialBlocks` arrives with new content (e.g.
  // when client-side navigation triggers a server re-render of `<CmsPage>`
  // for a new slug). `useState`'s lazy init only runs once on mount, so
  // without this the panel would show stale blocks after navigation.
  const initialBlocksRef = useRef(initialBlocks);
  useEffect(() => {
    if (initialBlocks === initialBlocksRef.current) return;
    initialBlocksRef.current = initialBlocks;
    setBlocksState(indexBlocksByPath(initialBlocks ?? []));
    setActiveBlock(null);
    setDraftsState(new Map());
  }, [initialBlocks]);

  // Backstop: the root layout's `<CmsPage>` is preserved across client-side
  // navigation, so its `initialBlocks` prop frequently does NOT update even
  // when the URL changes. Watch the pathname directly: drop stale blocks +
  // any open edit, then bump `refetchToken` to force `useCmsContent` to
  // pull fresh data for the new slug. Without this, navigating from / to
  // /gecekodu leaves the admin panel showing the home page's blocks.
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setBlocksState(new Map());
    setActiveBlock(null);
    setDraftsState(new Map());
    setRefetchToken((n) => n + 1);
  }, [pathname]);

  // Drop drafts for blocks that no longer exist (e.g. after a manifest sync
  // that removed the block). Pathname-change drafts are already cleared by
  // the effect above; this catches the manifest-sync case.
  useEffect(() => {
    setDraftsState((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map();
      for (const [path, value] of prev) {
        if (blocks.has(path)) {
          next.set(path, value);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [blocks]);

  // Stash callbacks in refs so changes to the props don't bust the
  // memoised context value (server actions are stable references in
  // practice, but refs guarantee no spurious re-renders).
  const onAfterSaveRef = useRef(onAfterSave ?? null);
  onAfterSaveRef.current = onAfterSave ?? null;

  const getAccessTokenRef = useRef(getAccessToken ?? null);
  getAccessTokenRef.current = getAccessToken ?? null;

  const onSignOutRef = useRef(onSignOut ?? null);
  onSignOutRef.current = onSignOut ?? null;

  const triggerRefetch = useCallback(() => {
    setRefetchToken((n) => n + 1);
  }, []);

  const setDraft = useCallback(
    /** @param {string} blockPath @param {*} value */
    (blockPath, value) => {
      setDraftsState((prev) => {
        const next = new Map(prev);
        next.set(blockPath, value);
        return next;
      });
    },
    [],
  );

  const clearDraft = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setDraftsState((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
        return next;
      });
    },
    [],
  );

  const clearDrafts = useCallback(() => {
    setDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const setDrawerOpen = useCallback(
    /** @param {boolean} open */
    (open) => {
      setIsDrawerOpen(open);
      // Closing the panel cancels any in-progress edit so the next time it
      // opens the user lands back on the block list, not on stale draft state.
      if (!open) setActiveBlock(null);
    },
    [],
  );

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

  // Cache-aware collection item fetch. Cache hit -> no-op; in-flight
  // request for the same (key, slug) -> piggyback on the existing
  // promise; otherwise fire fetch and write the result into the cache.
  const requestCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {boolean} [force] @returns {Promise<void>} */
    async (key, slug, force = false) => {
      const cacheKey = `${key}:${slug}`;
      const cached = collectionItemCache.get(cacheKey);
      if (!force && cached && !cached.error) return;

      const existing = inFlightCollectionItems.current.get(cacheKey);
      if (existing && !force) return existing;

      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        const prior = prev.get(cacheKey);
        next.set(cacheKey, {
          item: prior?.item ?? null,
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await stableGetAccessToken();
          const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
          const item = await fetchCollectionItem(normalizedConfig, key, slug, init);
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, { item, isLoading: false, error: null });
            return next;
          });
        } catch (err) {
          // 404 is normal control-flow for single-item reads; skip the
          // log noise but surface the error on the entry.
          if (!(err && /** @type {*} */ (err).isNotFound)) {
            // eslint-disable-next-line no-console
            console.error(`[skylab-cms] fetchCollectionItem(${key}/${slug}) failed:`, err);
          }
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              item: null,
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          inFlightCollectionItems.current.delete(cacheKey);
        }
      })();

      inFlightCollectionItems.current.set(cacheKey, promise);
      return promise;
    },
    [collectionItemCache, normalizedConfig, stableGetAccessToken],
  );

  const requestCollectionList = useCallback(
    /** @param {string} key @param {boolean} [force] @returns {Promise<void>} */
    async (key, force = false) => {
      const cached = collectionListCache.get(key);
      if (!force && cached && !cached.error) return;

      const existing = inFlightCollectionLists.current.get(key);
      if (existing && !force) return existing;

      setCollectionListCache((prev) => {
        const next = new Map(prev);
        const prior = prev.get(key);
        next.set(key, {
          items: prior?.items ?? [],
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await stableGetAccessToken();
          const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
          const items = await fetchCollection(normalizedConfig, key, init);
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(key, { items, isLoading: false, error: null });
            return next;
          });
          // Seed the item cache from the list payload - the response
          // already carries each row's full `data`, so per-item fetches
          // (`useCollectionItem` mounting for each row in a Region tab)
          // become cache hits and don't issue redundant GETs.
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            for (const item of items) {
              next.set(`${key}:${item.slug}`, { item, isLoading: false, error: null });
            }
            return next;
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[skylab-cms] fetchCollection(${key}) failed:`, err);
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(key, {
              items: [],
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          inFlightCollectionLists.current.delete(key);
        }
      })();

      inFlightCollectionLists.current.set(key, promise);
      return promise;
    },
    [collectionListCache, normalizedConfig, stableGetAccessToken],
  );

  // Provider-level /me fetch (state declared earlier). One request per
  // session per admin; collected re-fetches go through `refetchMyCollections`.
  useEffect(() => {
    if (!isAdmin) {
      setMyCollectionsState({ data: [], isLoading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setMyCollectionsState((s) => ({ ...s, isLoading: true, error: null }));
    (async () => {
      try {
        const token = await stableGetAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        const data = await fetchMyCollections(normalizedConfig, init);
        if (cancelled) return;
        setMyCollectionsState({ data, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[skylab-cms] fetchMyCollections failed:", err);
        setMyCollectionsState({ data: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();
    return () => { cancelled = true; };
  }, [normalizedConfig, isAdmin, stableGetAccessToken, myCollectionsToken]);

  const stableOnSignOut = useCallback(() => {
    const fn = onSignOutRef.current;
    if (fn) fn();
  }, []);

  // ---- Draft autosave (PUT /cms/draft, 1s after last edit) ---------------
  //
  // Every keystroke updates `drafts`, which retriggers the debounce effect
  // below; after 1s of silence we group the dirty edits by slug and PUT each
  // group. Reads block/version/config/pathname through refs so unrelated
  // re-renders (refetch, theme changes, ...) don't reset the timer - only a
  // genuine `drafts` mutation does. A backend `updateContent` clears the
  // overlay automatically, so there's no explicit cleanup path here.

  const [draftSyncStatus, setDraftSyncStatus] = useState(
    /** @type {"idle"|"saving"|"saved"|"failed"} */ ("idle"),
  );

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const draftPathnameRef = useRef(pathname);
  draftPathnameRef.current = pathname;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const draftConfigRef = useRef(normalizedConfig);
  draftConfigRef.current = normalizedConfig;

  // Per-slug request chain. A fast typist can leave the previous PUT in
  // flight when the next debounce fires; chaining each slug's request onto
  // its predecessor guarantees the backend sees them in commit order and
  // an older draft can never clobber a newer one. Across slugs we still
  // parallelise (page + global header save independently).
  const inFlightDraftPerSlug = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  // Pulse-and-reset for the panel status dot. After a saved/failed signal
  // we drop back to idle ~1.2s later so the green/pink flash is purely
  // transient and the dot returns to its dirty/clean baseline.
  const draftStatusResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  const flashDraftStatus = useCallback(
    /** @param {"saved"|"failed"} kind */
    (kind) => {
      setDraftSyncStatus(kind);
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
      draftStatusResetRef.current = setTimeout(() => {
        setDraftSyncStatus("idle");
        draftStatusResetRef.current = null;
      }, 900);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAdminRef.current) return;
    if (drafts.size === 0) return;

    const timer = setTimeout(async () => {
      const currentBlocks = blocksRef.current;
      const currentPathname = draftPathnameRef.current ?? "/";
      const currentConfig = draftConfigRef.current;

      // Skip entries that no longer differ from the effective value
      // (`draftValue ?? value`): typing the same characters back to a
      // saved draft, or the block being removed by a refetch. The
      // comparison MUST be against the effective value so an undo
      // (local draft set to published while a server draft exists)
      // still sends a request - that's how the backend draft gets
      // cleared.
      /** @type {Map<string, import("../lib/schemas.js").UpdateBlockItem[]>} */
      const bySlug = new Map();
      for (const [blockPath, value] of drafts) {
        const block = currentBlocks.get(blockPath);
        if (!block) continue;
        const effective = block.draftValue ?? block.value;
        if (stableStringify(value) === stableStringify(effective)) continue;
        const slug = block._slug ?? currentPathname;
        const list = bySlug.get(slug) ?? [];
        list.push({ blockPath, value, version: block.version });
        bySlug.set(slug, list);
      }
      if (bySlug.size === 0) return;

      const accessToken = (await stableGetAccessToken()) || undefined;
      setDraftSyncStatus("saving");

      const slugEntries = [...bySlug.entries()];
      const results = await Promise.allSettled(
        slugEntries.map(([slug, blocksForSlug]) => {
          const previous =
            inFlightDraftPerSlug.current.get(slug) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(() =>
              updateDraft(
                currentConfig,
                { slug, blocks: blocksForSlug },
                accessToken,
              ),
            );
          inFlightDraftPerSlug.current.set(slug, next);
          return next;
        }),
      );

      // Optimistically reflect the backend's post-write state in the
      // local blocks map: each block we just PUT now has draftValue
      // equal to the value we sent, except when that value matches
      // `block.value` (published) - in which case the backend
      // auto-cleans and DraftValue becomes null. Without this update
      // an undo would still see `draftValue` populated until the next
      // refetch, leaving the dirty count and Save All button pointing
      // at the stale draft.
      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const [, blocksForSlug] = slugEntries[i];
        setBlocksState((prev) => {
          let mutated = false;
          const nextMap = new Map(prev);
          for (const sent of blocksForSlug) {
            const cur = nextMap.get(sent.blockPath);
            if (!cur) continue;
            const matchesPublished =
              stableStringify(sent.value) === stableStringify(cur.value);
            const newDraftValue = matchesPublished ? null : sent.value;
            if (
              stableStringify(cur.draftValue ?? null) ===
              stableStringify(newDraftValue)
            ) {
              continue;
            }
            nextMap.set(sent.blockPath, { ...cur, draftValue: newDraftValue });
            mutated = true;
          }
          return mutated ? nextMap : prev;
        });
      });

      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed) {
        for (const r of results) {
          if (r.status === "rejected") {
            // eslint-disable-next-line no-console
            console.warn("[skylab-cms] draft autosave failed:", r.reason);
          }
        }
        flashDraftStatus("failed");
      } else {
        flashDraftStatus("saved");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [drafts, stableGetAccessToken, flashDraftStatus]);

  const value = useMemo(
    () => ({
      config: normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      setBlocks: setBlocksState,
      drafts,
      setDraft,
      clearDraft,
      clearDrafts,
      activeBlock,
      setActiveBlock: setActiveBlockGuarded,
      refetchToken,
      triggerRefetch,
      itemSchemas: itemSchemasRef.current,
      registerItemSchema,
      unregisterItemSchema,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollections: myCollectionsState.data,
      myCollectionsLoading: myCollectionsState.isLoading,
      myCollectionsError: myCollectionsState.error,
      refetchMyCollections,
      collectionItemCache,
      requestCollectionItem,
      updateCollectionItem,
      invalidateCollectionItem,
      collectionListCache,
      requestCollectionList,
      invalidateCollectionList,
      onAfterSave: stableOnAfterSave,
      getAccessToken: stableGetAccessToken,
      draftSyncStatus,
      isDrawerOpen,
      setDrawerOpen,
      userInfo,
      onSignOut: onSignOut ? stableOnSignOut : null,
    }),
    [
      normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      drafts,
      setDraft,
      clearDraft,
      clearDrafts,
      activeBlock,
      setActiveBlockGuarded,
      refetchToken,
      triggerRefetch,
      itemSchemasVersion,
      registerItemSchema,
      unregisterItemSchema,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollectionsState,
      refetchMyCollections,
      collectionItemCache,
      requestCollectionItem,
      updateCollectionItem,
      invalidateCollectionItem,
      collectionListCache,
      requestCollectionList,
      invalidateCollectionList,
      stableOnAfterSave,
      stableGetAccessToken,
      draftSyncStatus,
      isDrawerOpen,
      setDrawerOpen,
      userInfo,
      onSignOut,
      stableOnSignOut,
    ],
  );

  // Push the page right when the admin drawer is open so the panel doesn't
  // overlap content. The chevron handle on the drawer's right edge sticks
  // out a tiny bit but doesn't add to the offset - panel width is the only
  // thing that pushes. Plain CSS transition - keeps `framer-motion` isolated
  // to the (lazy-loaded) admin chunk so public visitors don't pay for it.
  const contentOffset = isAdmin && isDrawerOpen ? ADMIN_PANEL_WIDTH : 0;

  return (
    <CmsContext.Provider value={value}>
      {isAdmin ? <ContentLoader /> : null}
      <div
        style={{
          marginLeft: contentOffset,
          transition: "margin-left 350ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {children}
      </div>
      {isAdmin ? <AdminDrawer /> : null}
    </CmsContext.Provider>
  );
}

// Must match PANEL_WIDTH inside AdminDrawer.jsx. Hardcoded here (rather than
// imported) so the constant stays out of the public bundle - AdminDrawer is
// dynamically imported and only loads for admins.
const ADMIN_PANEL_WIDTH = 440;

// Public visitors render entirely from `initialBlocks` (server-fetched and
// ISR-cached under `cmsCacheTag(slug)`); the cache is dropped on admin save
// via `revalidateCmsSlug`, so there is no reason to re-verify on every page
// view. Admin sessions still mount this so post-save `triggerRefetch` can
// pull fresh versions into the editor's view without a navigation.
function ContentLoader() {
  useCmsContent();
  return null;
}
