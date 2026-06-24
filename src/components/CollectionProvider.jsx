"use client";

/**
 * @file Provider that owns the collection-namespace state.
 *
 * Split out of `CmsProvider` so the core block editor doesn't depend on the
 * collection layer. Mounted *inside* `<CmsProvider>` (it reads `config`,
 * `isAdmin`, and `getAccessToken` back out of `CmsContext`), and supplies the
 * item/list cache store, the bindings registry, the `/me` schemas, and the
 * request/draft handlers through `CollectionContext`.
 *
 * Today `CmsProvider` mounts this automatically, so existing apps need no
 * changes. In a future major it becomes opt-in (imported from
 * `inscribed/collections`), at which point collection-free apps tree-shake
 * this whole module out.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { CollectionContext } from "../lib/collection-context.js";
import { createStore } from "../lib/store.js";
import { stableStringify } from "../lib/stable-stringify.js";

/**
 * @import { CollectionItemCacheEntry, CollectionListCacheEntry } from "../lib/collection-context.js"
 */

/**
 * @param {{ children: React.ReactNode }} props
 */
export function CollectionProvider({ children }) {
  // Core seams the collection layer needs: the transport ("how to talk to
  // the backend"), the admin gate (drives the /me fetch), and the stable
  // access-token getter (forwarded as Bearer on every request). All three
  // are stable references coming off the memoised CmsContext value.
  const { config, isAdmin, getAccessToken } = useCmsContext();

  // Drawer-side "open this row" signal for collection region tabs. When the
  // StatusBar's "Aç" jump targets a specific (key, slug), the RegionItemCard
  // reads this and auto-expands itself on next render, then clears it so
  // subsequent collection-tab visits don't re-open.
  const [activeCollectionItem, setActiveCollectionItem] = useState(
    /** @type {{ key: string, slug: string } | null} */ (null),
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
    /**
     * @param {string} blockPath
     * @param {{ collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }} binding
     */
    (blockPath, binding) => {
      setCollectionBindings((prev) => {
        const existing = prev.get(blockPath);
        // Compare via stableStringify so consumers passing inline filter
        // objects (`filter={{ featured: true }}`) don't churn the
        // registry every render. The drawer's tab discovery and panel
        // sub-section grouping both depend on stable identity here.
        if (existing && stableStringify(existing) === stableStringify(binding)) {
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

  // /cms/collections/me state - effect fires further down so the drawer's
  // per-Collection cards and per-Collection tabs share a single round-trip
  // instead of each mounting its own fetch.
  const [myCollectionsState, setMyCollectionsState] = useState(
    /** @returns {{ data: import("../lib/schemas.js").MyCollectionResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ data: [], isLoading: false, error: null }),
  );
  const [myCollectionsToken, setMyCollectionsToken] = useState(0);
  const refetchMyCollections = useCallback(() => {
    setMyCollectionsToken((n) => n + 1);
  }, []);

  // High-churn collection state - the item cache, the list cache, and the
  // live-edit draft overlays - lives in an external store (lib/store.js),
  // NOT React state, so it can stay out of the context `value`. React
  // context has no per-field subscription: any change to the context value
  // re-renders every consumer. Keeping these maps here meant a keystroke in
  // one row's editor re-rendered every <CollectionItem> / <CollectionRegion>
  // on the page. With the store, a write notifies subscribers directly (the
  // provider never re-renders) and each consumer reads a narrow slice via
  // `useStoreSelector`, so typing in one row only re-renders the consumers
  // that read that row.
  const collectionStoreRef = useRef(
    /** @type {import("../lib/store.js").Store<{ itemCache: Map<string, CollectionItemCacheEntry>, listCache: Map<string, CollectionListCacheEntry>, drafts: Map<string, *> }> | null} */
    (null),
  );
  if (collectionStoreRef.current === null) {
    collectionStoreRef.current = createStore({
      itemCache: new Map(),
      listCache: new Map(),
      drafts: new Map(),
    });
  }
  const collectionStore = collectionStoreRef.current;

  // Per-slice setters that preserve the old `setState(prev => next)`
  // contract: the updater gets the current map and returns the next one (or
  // the same reference to signal "no change", which the store treats as a
  // no-op).
  const setCollectionItemCache = useCallback(
    /** @param {(prev: Map<string, CollectionItemCacheEntry>) => Map<string, CollectionItemCacheEntry>} updater */
    (updater) => {
      collectionStore.set((s) => {
        const itemCache = updater(s.itemCache);
        return itemCache === s.itemCache ? s : { ...s, itemCache };
      });
    },
    [collectionStore],
  );
  const setCollectionListCache = useCallback(
    /** @param {(prev: Map<string, CollectionListCacheEntry>) => Map<string, CollectionListCacheEntry>} updater */
    (updater) => {
      collectionStore.set((s) => {
        const listCache = updater(s.listCache);
        return listCache === s.listCache ? s : { ...s, listCache };
      });
    },
    [collectionStore],
  );
  const setCollectionDraftsState = useCallback(
    /** @param {Map<string, *> | ((prev: Map<string, *>) => Map<string, *>)} updater */
    (updater) => {
      collectionStore.set((s) => {
        const drafts = typeof updater === "function" ? updater(s.drafts) : updater;
        return drafts === s.drafts ? s : { ...s, drafts };
      });
    },
    [collectionStore],
  );

  // In-flight promises - lives in a ref so concurrent `requestCollectionItem`
  // calls dedupe to a single fetch without going through a state update.
  const inFlightCollectionItems = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  const setCollectionDraft = useCallback(
    /** @param {string} key @param {string} slug @param {*} payload */
    (key, slug, payload) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionDraftsState((prev) => {
        const existing = prev.get(cacheKey);
        if (existing !== undefined && stableStringify(existing) === stableStringify(payload)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(cacheKey, payload);
        return next;
      });
    },
    [],
  );

  const clearCollectionDraft = useCallback(
    /** @param {string} key @param {string} slug */
    (key, slug) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionDraftsState((prev) => {
        if (!prev.has(cacheKey)) return prev;
        const next = new Map(prev);
        next.delete(cacheKey);
        return next;
      });
    },
    [],
  );

  const clearCollectionDrafts = useCallback(() => {
    setCollectionDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

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
      // List cache invalidation across every (filter, offset, limit)
      // window for this collection: a filtered view may have its row
      // set change in ways we can't patch in-place (item entered or
      // left the filter, new total, page boundary shifts). Subscribers
      // re-fetch their specific window on next render.
      const listPrefix = `${key}|`;
      setCollectionListCache((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const k of prev.keys()) {
          if (k.startsWith(listPrefix)) {
            next.delete(k);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    },
    [],
  );

  // Optimistic in-place patch: replaces the cached item AND the matching
  // row inside every list-cache window for this collection, without
  // invalidating those windows. Use for draft autosave / undo where the
  // filter membership doesn't change (filters apply to published `data`,
  // not `draftData`), so a refetch storm on every keystroke is wasteful
  // and racy - the list refetch would re-seed the item cache from the
  // server's not-yet-cleaned-up state, fighting our optimistic update.
  const patchCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {import("../lib/schemas.js").CollectionItemResponse} item */
    (key, slug, item) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, { item, isLoading: false, error: null });
        return next;
      });
      const listPrefix = `${key}|`;
      setCollectionListCache((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const [k, entry] of prev.entries()) {
          if (!k.startsWith(listPrefix)) continue;
          const idx = entry.items.findIndex((r) => r.slug === slug);
          if (idx < 0) continue;
          const items = entry.items.slice();
          items[idx] = item;
          next.set(k, { ...entry, items });
          mutated = true;
        }
        return mutated ? next : prev;
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
    /**
     * @param {string} key
     * @param {import("../lib/schemas.js").CollectionListParams} [params]
     */
    (key, params) => {
      setCollectionListCache((prev) => {
        if (params) {
          const cacheKey = `${key}|${stableStringify(params)}`;
          if (!prev.has(cacheKey)) return prev;
          const next = new Map(prev);
          next.delete(cacheKey);
          return next;
        }
        // No params: drop every window for this collection.
        const prefix = `${key}|`;
        let mutated = false;
        const next = new Map(prev);
        for (const k of prev.keys()) {
          if (k.startsWith(prefix)) {
            next.delete(k);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
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
      const cached = collectionStore.get().itemCache.get(cacheKey);
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
          const token = await getAccessToken();
          const item = await config.transport.getCollectionItem(key, slug, { accessToken: token });
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
            console.error(`[inscribed] fetchCollectionItem(${key}/${slug}) failed:`, err);
          }
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            const prior = prev.get(cacheKey);
            // Keep the last good item on a failed (re)fetch - a transient
            // network blip on a force-refetch shouldn't blank already-
            // rendered content. Mirror the loading path, which also
            // preserves `prior?.item`; only the error flag changes.
            next.set(cacheKey, {
              item: prior?.item ?? null,
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
    [config, getAccessToken],
  );

  const requestCollectionList = useCallback(
    /**
     * @param {string} key
     * @param {import("../lib/schemas.js").CollectionListParams} [params]
     * @param {boolean} [force]
     * @returns {Promise<void>}
     */
    async (key, params, force = false) => {
      const paramsKey = stableStringify(params ?? {});
      const cacheKey = `${key}|${paramsKey}`;
      const cached = collectionStore.get().listCache.get(cacheKey);
      if (!force && cached && !cached.error) return;

      const existing = inFlightCollectionLists.current.get(cacheKey);
      if (existing && !force) return existing;

      setCollectionListCache((prev) => {
        const next = new Map(prev);
        const prior = prev.get(cacheKey);
        next.set(cacheKey, {
          items: prior?.items ?? [],
          total: prior?.total ?? 0,
          offset: prior?.offset ?? params?.offset ?? 0,
          limit: prior?.limit ?? params?.limit ?? 0,
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await getAccessToken();
          const response = await config.transport.getCollection(key, params, { accessToken: token });
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              items: response.items,
              total: response.total,
              offset: response.offset,
              limit: response.limit,
              isLoading: false,
              error: null,
            });
            return next;
          });
          // Seed the item cache from the list payload - the response
          // already carries each row's full `data`, so per-item fetches
          // (`useCollectionItem` mounting for each row in a Region tab)
          // become cache hits and don't issue redundant GETs.
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            for (const item of response.items) {
              const itemKey = `${key}:${item.slug}`;
              // Don't clobber a row the admin is actively editing: an open
              // editor reads the raw item cache (overlayDrafts: false), so
              // re-seeding from the server's view here would reset its
              // baseline mid-edit and the editor's seeding effect would
              // wipe unsaved keystrokes. A live local draft (set on every
              // change before autosave even fires) is the signal that an
              // editor is open on this slug.
              if (collectionStore.get().drafts.has(itemKey)) continue;
              next.set(itemKey, { item, isLoading: false, error: null });
            }
            return next;
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[inscribed] fetchCollection(${key}) failed:`, err);
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            const prior = prev.get(cacheKey);
            // Keep the last good page on a failed (re)fetch so a transient
            // error doesn't empty an already-rendered list/Region. Mirror
            // the loading path's `prior` preservation; surface the failure
            // through `error` only.
            next.set(cacheKey, {
              items: prior?.items ?? [],
              total: prior?.total ?? 0,
              offset: prior?.offset ?? params?.offset ?? 0,
              limit: prior?.limit ?? params?.limit ?? 0,
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          inFlightCollectionLists.current.delete(cacheKey);
        }
      })();

      inFlightCollectionLists.current.set(cacheKey, promise);
      return promise;
    },
    [config, getAccessToken],
  );

  // Provider-level /me fetch. One request per session per admin; collected
  // re-fetches go through `refetchMyCollections`.
  useEffect(() => {
    if (!isAdmin) {
      setMyCollectionsState({ data: [], isLoading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setMyCollectionsState((s) => ({ ...s, isLoading: true, error: null }));
    (async () => {
      try {
        const token = await getAccessToken();
        const data = await config.transport.getMyCollections({ accessToken: token });
        if (cancelled) return;
        setMyCollectionsState({ data, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[inscribed] fetchMyCollections failed:", err);
        setMyCollectionsState({ data: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();
    return () => { cancelled = true; };
  }, [config, isAdmin, getAccessToken, myCollectionsToken]);

  // Soft-nav cleanup: drop live-edit draft overlays when the route changes
  // so a stale overlay doesn't leak onto a different page's collection rows.
  // (The core block drafts are cleared by CmsProvider's own pathname effect.)
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setCollectionDraftsState(new Map());
  }, [pathname, setCollectionDraftsState]);

  const value = useMemo(
    () => ({
      activeCollectionItem,
      setActiveCollectionItem,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollections: myCollectionsState.data,
      myCollectionsLoading: myCollectionsState.isLoading,
      myCollectionsError: myCollectionsState.error,
      refetchMyCollections,
      // The item/list caches and draft overlays are NOT in the value: they
      // live in `collectionStore` (a stable ref) and consumers subscribe to
      // narrow slices via `useStoreSelector`. This is what keeps a keystroke
      // in one row's editor from re-rendering every collection consumer.
      collectionStore,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      requestCollectionList,
      invalidateCollectionList,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
    }),
    [
      activeCollectionItem,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollectionsState,
      refetchMyCollections,
      collectionStore,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      requestCollectionList,
      invalidateCollectionList,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
    ],
  );

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}
