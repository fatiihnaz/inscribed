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

import { useCmsContext } from "../shared/state/cms-context.js";
import { CollectionContext } from "./context.js";
import { createStore } from "../shared/state/store.js";
import { createDraftQueue } from "../shared/state/draft-queue.js";
import { stableStringify } from "../shared/util/stable-stringify.js";
import { deepEqual } from "../shared/util/deep-equal.js";

/**
 * @import { CollectionItemCacheEntry, CollectionListCacheEntry } from "./context.js"
 * @import { CollectionBinding } from "../shared/contracts/schemas.js"
 */

/**
 * @param {{ children: React.ReactNode }} props
 */
export function CollectionProvider({ children }) {
  // Seams from CmsContext: transport, the admin gate (drives the /me fetch),
  // and the access-token getter (forwarded as Bearer on every request).
  const { config, isAdmin, getAccessToken } = useCmsContext();

  // Read through refs inside the request handlers so those keep one identity
  // for the life of the provider. They are published on the context value, and
  // anything unstable there re-renders every consumer (see shared/state/cms-context.js).
  // The /me effect below still depends on them directly: it *should* re-run
  // when the session changes.
  const configRef = useRef(config);
  configRef.current = config;
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  // Every collection slice lives in one external store, not React state, so a
  // write only re-renders the consumers selecting that slice and the context
  // value stays put for the whole session. (See shared/state/store.js.)
  //
  //   itemCache/listCache/drafts/draftSavedAt - request + overlay state
  //   bindings      - what the page points at, for the drawer's lanes
  //   inlineFields  - which scope drives a record's shared draft
  //   activeItem    - the drawer's one-shot "open this row" signal
  //   meta          - /cms/collections/me, by key and in server order
  const collectionStoreRef = useRef(
    /** @type {import("../shared/state/store.js").Store<import("./context.js").CollectionStoreState> | null} */
    (null),
  );
  if (collectionStoreRef.current === null) {
    collectionStoreRef.current = createStore({
      itemCache: new Map(),
      listCache: new Map(),
      drafts: new Map(),
      draftSavedAt: new Map(),
      bindings: new Map(),
      inlineFields: new Map(),
      createLanes: new Map(),
      editorValues: new Map(),
      activeItem: null,
      meta: { byKey: new Map(), order: [], isLoading: false, error: null },
    });
  }
  const collectionStore = collectionStoreRef.current;

  // One queue for every collection draft write. Keyed by target endpoint (see
  // shared/state/draft-keys.js), so the surfaces that write the same slot share a lane
  // and their requests can't reorder. Pinned in a ref for the same reason the
  // store is: a `useMemo` React may drop would swap the queue out from under
  // in-flight writes.
  const draftQueueRef = useRef(
    /** @type {import("../shared/state/draft-queue.js").DraftQueue | null} */ (null),
  );
  if (draftQueueRef.current === null) {
    draftQueueRef.current = createDraftQueue();
  }
  const draftQueue = draftQueueRef.current;
  useEffect(() => () => draftQueue.dispose(), [draftQueue]);

  // Drawer-side "open this row" signal: set by the StatusBar's "Aç" jump, read
  // once by the matching RegionItemCard to auto-expand.
  const setActiveCollectionItem = useCallback(
    /** @param {{ key: string, slug: string } | null} next */
    (next) => {
      collectionStore.set((s) => (s.activeItem === next ? s : { ...s, activeItem: next }));
    },
    [collectionStore],
  );

  // Registry of `<CollectionItem>` / `<CollectionRegion>` bindings. Collections
  // aren't in the manifest, so the drawer learns them via this runtime registry.
  //
  // Refcounts live in a ref and the published Map in the store: a binding is
  // keyed by the record (or filter window) it addresses, so the same one can be
  // rendered many times on a page, and only the last unmount may drop it. The
  // ref also means a re-registration of something already bound publishes
  // nothing, keeping the drawer's memos off the churn path.
  const bindingEntriesRef = useRef(
    /** @type {Map<string, { binding: CollectionBinding, count: number }>} */ (new Map()),
  );

  const publishCollectionBindings = useCallback(() => {
    /** @type {Map<string, CollectionBinding>} */
    const next = new Map();
    for (const [id, entry] of bindingEntriesRef.current) next.set(id, entry.binding);
    collectionStore.set((s) => ({ ...s, bindings: next }));
  }, [collectionStore]);

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
          !deepEqual(existing.binding, binding)
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

  const publishInlineFieldRecords = useCallback(() => {
    /** @type {Map<string, string>} */
    const next = new Map();
    for (const [key, scopes] of inlineFieldCountsRef.current) {
      // Insertion order: the scope that claimed the record first keeps it, and
      // hands over to the next one only when it unmounts.
      const first = scopes.keys().next();
      if (!first.done) next.set(key, first.value);
    }
    collectionStore.set((s) => ({ ...s, inlineFields: next }));
  }, [collectionStore]);

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

  // Editor form state, keyed per surface rather than per record: two surfaces
  // editing one record each keep their own working copy and reconcile through
  // the shared draft, which is what the userEditRef/lastSyncedRef protocol in
  // `useCollectionEditor` is built on.
  const setEditorValues = useCallback(
    /**
     * @param {string} editorId
     * @param {Record<string, *> | ((prev: Record<string, *> | null) => Record<string, *>)} updater
     */
    (editorId, updater) => {
      collectionStore.set((s) => {
        const prev = s.editorValues.get(editorId) ?? null;
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (next === prev) return s;
        const editorValues = new Map(s.editorValues);
        editorValues.set(editorId, next);
        return { ...s, editorValues };
      });
    },
    [collectionStore],
  );

  const clearEditorValues = useCallback(
    /** @param {string} editorId */
    (editorId) => {
      collectionStore.set((s) => {
        if (!s.editorValues.has(editorId)) return s;
        const editorValues = new Map(s.editorValues);
        editorValues.delete(editorId);
        return { ...s, editorValues };
      });
    },
    [collectionStore],
  );

  // A collection has one new-item draft slot, so two composers for the same key
  // would write it at once. Same election as `inlineFields`, minus the record:
  // the first to claim the lane keeps it until it unmounts.
  const createLaneCountsRef = useRef(
    /** @type {Map<string, Map<string, number>>} */ (new Map()),
  );

  const publishCreateLanes = useCallback(() => {
    /** @type {Map<string, string>} */
    const next = new Map();
    for (const [collection, scopes] of createLaneCountsRef.current) {
      const first = scopes.keys().next();
      if (!first.done) next.set(collection, first.value);
    }
    collectionStore.set((s) => ({ ...s, createLanes: next }));
  }, [collectionStore]);

  const claimCreateLane = useCallback(
    /** @param {string} collection @param {string} scopeId */
    (collection, scopeId) => {
      let scopes = createLaneCountsRef.current.get(collection);
      if (!scopes) {
        scopes = new Map();
        createLaneCountsRef.current.set(collection, scopes);
      }
      const count = scopes.get(scopeId) ?? 0;
      scopes.set(scopeId, count + 1);
      if (count === 0) publishCreateLanes();
    },
    [publishCreateLanes],
  );

  const releaseCreateLane = useCallback(
    /** @param {string} collection @param {string} scopeId */
    (collection, scopeId) => {
      const scopes = createLaneCountsRef.current.get(collection);
      const count = scopes?.get(scopeId);
      if (!scopes || !count) return;
      if (count > 1) {
        scopes.set(scopeId, count - 1);
        return;
      }
      scopes.delete(scopeId);
      if (scopes.size === 0) createLaneCountsRef.current.delete(collection);
      publishCreateLanes();
    },
    [publishCreateLanes],
  );

  // Bumping this re-runs the /me effect. It is the one piece of React state
  // left here, and it is a fetch trigger only: it never reaches the value.
  const [myCollectionsToken, setMyCollectionsToken] = useState(0);
  const refetchMyCollections = useCallback(() => {
    setMyCollectionsToken((n) => n + 1);
  }, []);

  const setCollectionMeta = useCallback(
    /** @param {import("./context.js").CollectionMeta} meta */
    (meta) => {
      collectionStore.set((s) => ({ ...s, meta }));
    },
    [collectionStore],
  );

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
        if (existing !== undefined && deepEqual(existing, payload)) {
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

  const setCollectionDraftSavedAt = useCallback(
    /**
     * @param {string} key
     * @param {string} slug
     * @param {string | null} at  `null` drops it, e.g. once the draft is gone.
     */
    (key, slug, at) => {
      const cacheKey = `${key}:${slug}`;
      collectionStore.set((st) => {
        const has = st.draftSavedAt.has(cacheKey);
        if (at === null ? !has : st.draftSavedAt.get(cacheKey) === at) return st;
        const draftSavedAt = new Map(st.draftSavedAt);
        if (at === null) draftSavedAt.delete(cacheKey);
        else draftSavedAt.set(cacheKey, at);
        return { ...st, draftSavedAt };
      });
    },
    [collectionStore],
  );

  const clearCollectionDrafts = useCallback(() => {
    setCollectionDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const inFlightCollectionLists = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  const updateCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {import("../shared/contracts/schemas.js").CollectionItemResponse} item */
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
    /** @param {string} key @param {string} slug @param {import("../shared/contracts/schemas.js").CollectionItemResponse} item */
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
     * @param {import("../shared/contracts/schemas.js").CollectionListParams} [params]
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
          const token = await getAccessTokenRef.current();
          const item = await configRef.current.transport.getCollectionItem(key, slug, { accessToken: token });
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
          // Only our own entry: a forced refetch may have replaced it, and
          // deleting that one would leave a genuinely in-flight request
          // invisible to the dedupe check.
          if (inFlightCollectionItems.current.get(cacheKey) === promise) {
            inFlightCollectionItems.current.delete(cacheKey);
          }
        }
      })();

      inFlightCollectionItems.current.set(cacheKey, promise);
      return promise;
    },
    [collectionStore, setCollectionItemCache],
  );

  const requestCollectionList = useCallback(
    /**
     * @param {string} key
     * @param {import("../shared/contracts/schemas.js").CollectionListParams} [params]
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
          virtualItems: prior?.virtualItems ?? [],
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await getAccessTokenRef.current();
          const response = await configRef.current.transport.getCollection(key, params, { accessToken: token });
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              items: response.items,
              total: response.total,
              offset: response.offset,
              limit: response.limit,
              virtualItems: response.virtualItems ?? [],
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
              virtualItems: prior?.virtualItems ?? [],
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          // Same ownership check as the item variant above.
          if (inFlightCollectionLists.current.get(cacheKey) === promise) {
            inFlightCollectionLists.current.delete(cacheKey);
          }
        }
      })();

      inFlightCollectionLists.current.set(cacheKey, promise);
      return promise;
    },
    [collectionStore, setCollectionListCache, setCollectionItemCache],
  );

  // Provider-level /me fetch: one request per admin session; re-fetches go
  // through `refetchMyCollections`.
  useEffect(() => {
    if (!isAdmin) {
      setCollectionMeta({ byKey: new Map(), order: [], isLoading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setCollectionMeta({
      ...collectionStore.get().meta, isLoading: true, error: null,
    });
    (async () => {
      try {
        const token = await getAccessToken();
        const data = await config.transport.getMyCollections({ accessToken: token });
        if (cancelled) return;
        // Indexed for the per-card lookup and kept in server order for the
        // drawer's rail, which lists them as they come back.
        setCollectionMeta({
          byKey: new Map(data.map((c) => [c.collectionKey, c])),
          order: data,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[inscribed] fetchMyCollections failed:", err);
        setCollectionMeta({
          byKey: new Map(), order: [], isLoading: false, error: /** @type {Error} */ (err),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [config, isAdmin, getAccessToken, myCollectionsToken, setCollectionMeta, collectionStore]);

  // Soft-nav cleanup: drop draft overlays on route change so a stale one
  // doesn't leak onto another page's rows.
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setCollectionDraftsState(new Map());
  }, [pathname, setCollectionDraftsState]);

  // Seams only. Every entry below is identity-stable for the life of the
  // provider, so mounting a record, claiming a field or resolving /me cannot
  // re-render an unrelated consumer. State reaches consumers through
  // `collectionStore` selectors instead. Guarded by
  // tests/collections/context-split.test.jsx.
  const value = useMemo(
    () => ({
      collectionStore,
      draftQueue,
      setActiveCollectionItem,
      registerCollectionBinding,
      unregisterCollectionBinding,
      registerInlineField,
      unregisterInlineField,
      claimCreateLane,
      releaseCreateLane,
      setEditorValues,
      clearEditorValues,
      refetchMyCollections,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      requestCollectionList,
      invalidateCollectionList,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
      setCollectionDraftSavedAt,
    }),
    [
      collectionStore,
      draftQueue,
      setActiveCollectionItem,
      registerCollectionBinding,
      unregisterCollectionBinding,
      registerInlineField,
      unregisterInlineField,
      claimCreateLane,
      releaseCreateLane,
      setEditorValues,
      clearEditorValues,
      refetchMyCollections,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      requestCollectionList,
      invalidateCollectionList,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
      setCollectionDraftSavedAt,
    ],
  );

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}
