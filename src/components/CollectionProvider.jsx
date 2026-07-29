"use client";

/**
 * @file Provider owning the collection-namespace state, split out of
 * `CmsProvider` so the core block editor doesn't depend on this layer. Mounts
 * inside `<CmsProvider>` (reads `config`/`isAdmin`/`getAccessToken` from
 * `CmsContext`) and supplies the cache store, bindings registry, `/me` schemas,
 * and request/draft handlers through `CollectionContext`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { CollectionContext } from "../lib/collection-context.js";
import { createStore } from "../lib/store.js";
import { stableStringify } from "../lib/stable-stringify.js";

/**
 * @import { CollectionItemCacheEntry, CollectionListCacheEntry } from "../lib/collection-context.js"
 * @import { CollectionBinding } from "../lib/schemas.js"
 */

/**
 * @param {{ children: React.ReactNode }} props
 */
export function CollectionProvider({ children }) {
  // Seams from CmsContext: transport, the admin gate (drives the /me fetch),
  // and the access-token getter (forwarded as Bearer on every request).
  const { config, isAdmin, getAccessToken } = useCmsContext();

  // Drawer-side "open this row" signal: set by the StatusBar's "Aç" jump, read
  // once by the matching RegionItemCard to auto-expand.
  const [activeCollectionItem, setActiveCollectionItem] = useState(
    /** @type {{ key: string, slug: string } | null} */ (null),
  );

  // Registry of `<CollectionItem>` / `<CollectionRegion>` bindings. Collections
  // aren't in the manifest, so the drawer learns them via this runtime registry.
  // State-based so consumer useMemos recompute when bindings come and go.
  //
  // Refcounts live in a ref and the published Map in state: a binding is keyed
  // by the record (or filter window) it addresses, so the same one can be
  // rendered many times on a page, and only the last unmount may drop it. The
  // ref also means a re-registration of something already bound publishes
  // nothing, keeping the drawer's memos off the churn path.
  const bindingEntriesRef = useRef(
    /** @type {Map<string, { binding: CollectionBinding, count: number }>} */ (new Map()),
  );
  const [collectionBindings, setCollectionBindings] = useState(
    /** @returns {Map<string, CollectionBinding>} */
    () => new Map(),
  );

  const publishCollectionBindings = useCallback(() => {
    /** @type {Map<string, CollectionBinding>} */
    const next = new Map();
    for (const [id, entry] of bindingEntriesRef.current) next.set(id, entry.binding);
    setCollectionBindings(next);
  }, []);

  const registerCollectionBinding = useCallback(
    /**
     * @param {string} bindingId
     * @param {CollectionBinding} binding
     */
    (bindingId, binding) => {
      const existing = bindingEntriesRef.current.get(bindingId);
      if (existing) {
        // Same record, two render sites: the binding value is presentation
        // (group, label), so the first one on the page wins and the rest just
        // hold the entry open.
        if (
          process.env.NODE_ENV !== "production" &&
          stableStringify(existing.binding) !== stableStringify(binding)
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[inscribed] "${bindingId}" is bound more than once with different placement; keeping ${stableStringify(existing.binding)} and ignoring ${stableStringify(binding)}.`,
          );
        }
        existing.count += 1;
        return;
      }
      bindingEntriesRef.current.set(bindingId, { binding, count: 1 });
      publishCollectionBindings();
    },
    [publishCollectionBindings],
  );

  const unregisterCollectionBinding = useCallback(
    /** @param {string} bindingId */
    (bindingId) => {
      const existing = bindingEntriesRef.current.get(bindingId);
      if (!existing) return;
      existing.count -= 1;
      if (existing.count > 0) return;
      bindingEntriesRef.current.delete(bindingId);
      publishCollectionBindings();
    },
    [publishCollectionBindings],
  );

  // Records that currently have `<CollectionField>`s on the page. Two surfaces
  // can edit one record (page fields and the drawer card), and both would run
  // their own debounced autosave against the same draft slot, so this is how
  // they agree on a single driver: page fields win while they exist.
  //
  // Provider-level because the drawer is a sibling of the page tree, not a
  // descendant, so a context published from `<CollectionItem>` can't reach it.
  // Counted per record *and* per `<CollectionItem>` scope, because one record
  // can be rendered twice on a page: the record's presence is what stands the
  // drawer down, while the first scope to claim it is the one that drives.
  const inlineFieldCountsRef = useRef(
    /** @type {Map<string, Map<string, number>>} */ (new Map()),
  );
  const [inlineFieldRecords, setInlineFieldRecords] = useState(
    /** @returns {Map<string, string>} */
    () => new Map(),
  );

  const publishInlineFieldRecords = useCallback(() => {
    /** @type {Map<string, string>} */
    const next = new Map();
    for (const [key, scopes] of inlineFieldCountsRef.current) {
      // Insertion order: the scope that claimed the record first keeps it, and
      // hands over to the next one only when it unmounts.
      const first = scopes.keys().next();
      if (!first.done) next.set(key, first.value);
    }
    setInlineFieldRecords(next);
  }, []);

  const registerInlineField = useCallback(
    /**
     * @param {string} collection
     * @param {string} slug
     * @param {string} scopeId
     */
    (collection, slug, scopeId) => {
      const key = `${collection}:${slug}`;
      let scopes = inlineFieldCountsRef.current.get(key);
      if (!scopes) {
        scopes = new Map();
        inlineFieldCountsRef.current.set(key, scopes);
      }
      const count = scopes.get(scopeId) ?? 0;
      scopes.set(scopeId, count + 1);
      // Only a scope's first field can change the answer, so the rest are free.
      if (count === 0) publishInlineFieldRecords();
    },
    [publishInlineFieldRecords],
  );

  const unregisterInlineField = useCallback(
    /**
     * @param {string} collection
     * @param {string} slug
     * @param {string} scopeId
     */
    (collection, slug, scopeId) => {
      const key = `${collection}:${slug}`;
      const scopes = inlineFieldCountsRef.current.get(key);
      const count = scopes?.get(scopeId);
      if (!scopes || !count) return;
      if (count > 1) {
        scopes.set(scopeId, count - 1);
        return;
      }
      scopes.delete(scopeId);
      if (scopes.size === 0) inlineFieldCountsRef.current.delete(key);
      publishInlineFieldRecords();
    },
    [publishInlineFieldRecords],
  );

  // /cms/collections/me state. The fetch (further down) runs once so the
  // drawer's cards and tabs share one round-trip instead of each fetching.
  const [myCollectionsState, setMyCollectionsState] = useState(
    /** @returns {{ data: import("../lib/schemas.js").MyCollectionResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ data: [], isLoading: false, error: null }),
  );
  const [myCollectionsToken, setMyCollectionsToken] = useState(0);
  const refetchMyCollections = useCallback(() => {
    setMyCollectionsToken((n) => n + 1);
  }, []);

  // High-churn state (item cache, list cache, draft overlays) lives in an
  // external store, not React state, so it stays out of the context value and a
  // write only re-renders the consumers reading that slice. (See lib/store.js.)
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

  // Per-slice setters preserving the `setState(prev => next)` contract;
  // returning the same reference is a no-op in the store.
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

  // In-flight promises in a ref so concurrent `requestCollectionItem` calls
  // dedupe to one fetch without a state update.
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
      // Invalidate every list window for this collection: a save can change a
      // filtered view's row set in ways we can't patch (membership, total, page
      // boundaries), so subscribers re-fetch their window on next render.
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

  // Optimistic in-place patch: replace the cached item and the matching row in
  // every list window, without invalidating them. For draft autosave/undo,
  // where filter membership can't change (filters apply to published `data`),
  // so a per-keystroke refetch storm is wasteful and would race our update.
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

  // Cache-aware item fetch: cache hit is a no-op, an in-flight request for the
  // same (key, slug) is piggybacked, else fetch and cache the result.
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
            // Keep the last good item on a failed (re)fetch so a transient blip
            // doesn't blank already-rendered content; only the error flag changes.
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
          // Seed the item cache from the list payload (each row carries full
          // `data`), so per-row `useCollectionItem` mounts hit the cache.
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            for (const item of response.items) {
              const itemKey = `${key}:${item.slug}`;
              // Don't clobber a row being edited: an open editor reads the raw
              // cache, so re-seeding would reset its baseline mid-edit. A live
              // draft is the signal that an editor is open on this slug.
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
            // Keep the last good page on a failed (re)fetch so a transient error
            // doesn't empty an already-rendered list; only the error flag changes.
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

  // Provider-level /me fetch: one request per admin session; re-fetches go
  // through `refetchMyCollections`.
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

  // Soft-nav cleanup: drop draft overlays on route change so a stale one
  // doesn't leak onto another page's rows.
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
      inlineFieldRecords,
      registerInlineField,
      unregisterInlineField,
      myCollections: myCollectionsState.data,
      myCollectionsLoading: myCollectionsState.isLoading,
      myCollectionsError: myCollectionsState.error,
      refetchMyCollections,
      // Caches and draft overlays aren't in the value; they live in
      // `collectionStore` so a keystroke doesn't re-render every consumer.
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
      inlineFieldRecords,
      registerInlineField,
      unregisterInlineField,
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
