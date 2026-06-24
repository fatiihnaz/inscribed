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
import { usePathname, useRouter } from "next/navigation";

import { CmsContext } from "../lib/context.js";
import { createCmsConfig } from "../lib/config.js";
import { buildThemeCss } from "../lib/theme.js";
import { createRestTransport } from "../defaults/transport.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { createStore } from "../lib/store.js";
import { useCmsContent } from "../hooks/use-cms-content.js";
import { CollectionProvider } from "./CollectionProvider.jsx";

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
 * @param {import("../lib/transport.js").CmsTransport} [props.transport]   Custom client-side data-access adapter. Defaults to the REST transport built from `config`. Injected here (not via `config`) because it holds functions, which can't cross the RSC boundary as a serialized prop.
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
  transport,
  userInfo = null,
  onSignOut,
  children,
}) {
  // `config` arrives as serializable data (it crosses the RSC boundary as a
  // prop, e.g. from `createCmsPage`). The transport holds functions, so it
  // can't ride along on that prop - we build it here on the client and
  // augment it onto the config the rest of the tree reads through context,
  // where it never has to be serialized. Pass a custom `transport` prop to
  // override; otherwise the default REST adapter targets `config.baseUrl`.
  const baseConfig = useMemo(
    () => "baseUrl" in config && Object.isFrozen(config) ? /** @type {CmsConfig} */ (config) : createCmsConfig(config),
    [config],
  );
  const normalizedConfig = useMemo(
    () => ({
      ...baseConfig,
      transport: transport ?? baseConfig.transport ?? createRestTransport(baseConfig),
    }),
    [baseConfig, transport],
  );

  // Theme overrides ride along on the serializable config as a normalized
  // subset (see `theme.js`). Emit them once here as a `:root` block of
  // `--ins-*` custom properties; every visual token reads them with a baked
  // default fallback, so an empty theme emits nothing and the stock palette
  // shows through. Lives at the provider root (not the drawer) so page-side
  // editing affordances pick the vars up too.
  const themeCss = useMemo(() => buildThemeCss(baseConfig.theme), [baseConfig.theme]);

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
  // Drawer-side "open this list row" signal — the List-block analogue of
  // `activeCollectionItem`. Set when a page-side `<EditableList>` item is
  // clicked; the matching `ListItemCard` reads it, expands, scrolls into
  // view, then clears it so it only fires once.
  const [activeListItem, setActiveListItem] = useState(
    /** @type {{ path: string, index: number } | null} */ (null),
  );
  const [refetchToken, setRefetchToken] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Per-blockPath unsaved edits (live-preview overlay while the admin types).
  // Lives in an external store, NOT React state, for the same reason as the
  // collection store (now in `CollectionProvider`): keeping it in the context
  // value re-rendered every
  // <EditableRegion> / <EditableList> on the page on every keystroke. With the
  // store, page-side consumers subscribe to their own blockPath via
  // `useStoreSelector`, so typing in one region only re-renders that region.
  // Cleared on save / discard / navigation. `setDraftsState` keeps the old
  // `setState(value | prev => next)` shape - the store no-ops when the updater
  // returns the same reference - so every existing call site is untouched.
  const contentDraftsStoreRef = useRef(
    /** @type {import("../lib/store.js").Store<Map<string, *>> | null} */ (null),
  );
  if (contentDraftsStoreRef.current === null) {
    contentDraftsStoreRef.current = createStore(new Map());
  }
  const contentDraftsStore = contentDraftsStoreRef.current;
  const setDraftsState = contentDraftsStore.set;

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

  // Registry of per-region editor-visibility overrides from `<EditableRegion>`'s
  // `visible` / `editable` props. Those props are page-side runtime metadata
  // (not in the manifest/blocks map), so this is how the drawer learns to
  // hide or lock a block. State-based (new Map identity per change) so the
  // drawer's block-list useMemo recomputes naturally when overrides come/go.
  const [editorVisibility, setEditorVisibility] = useState(
    /** @returns {Map<string, "hidden"|"readonly">} */
    () => new Map(),
  );

  const registerEditorVisibility = useCallback(
    /** @param {string} blockPath @param {"hidden"|"readonly"} mode */
    (blockPath, mode) => {
      setEditorVisibility((prev) => {
        if (prev.get(blockPath) === mode) return prev;
        const next = new Map(prev);
        next.set(blockPath, mode);
        return next;
      });
    },
    [],
  );

  const unregisterEditorVisibility = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setEditorVisibility((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
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
  // navigation, so its `initialBlocks` prop doesn't update on its own when
  // the URL changes. `router.refresh()` forces Next.js to re-render the
  // layout's server components — `getCmsPageBlocks` runs again with the
  // new pathname (via the middleware-set `x-pathname` header), the fresh
  // `initialBlocks` flow back through this provider's prop, and the
  // `initialBlocks` watcher above seeds the blocks map. This works for
  // public visitors too because the server fetch uses the service token,
  // not the user's session — so we don't need a client-side fetch path
  // (which would 401 anonymous traffic).
  const pathname = usePathname();
  const router = useRouter();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setActiveBlock(null);
    setDraftsState(new Map());
    router.refresh();
  }, [pathname, router]);

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
    discardGenRef.current += 1;
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

  // Content drafts live in `contentDraftsStore` now, so a write doesn't
  // re-render the provider - this effect can't use `[drafts]` as its trigger
  // anymore. Instead we subscribe to the store and (re-)arm the debounce on
  // each change: every edit clears the pending timer and starts a fresh 1s
  // countdown, so a successful PUT only fires 1s after the last keystroke.
  const autosaveTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  // Incremented on every explicit discard so the in-flight autosave PUT
  // can detect that a discard happened while it was awaiting and skip
  // the "Taslak kaydedildi" flash (which would be wrong — the user just
  // threw those drafts away).
  const discardGenRef = useRef(0);
  useEffect(() => {
    const armDebounce = () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (!isAdminRef.current) return;
      if (contentDraftsStore.get().size === 0) return;

      autosaveTimerRef.current = setTimeout(async () => {
      autosaveTimerRef.current = null;
      const genAtDispatch = discardGenRef.current;
      const drafts = contentDraftsStore.get();
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

      // If every block being PUT has value === published (all resets to
      // baseline, e.g. per-block undo), treat it as a silent backend
      // cleanup — no "Kaydediliyor / Taslak kaydedildi" flash.
      const isAllReset = [...bySlug.values()].every((blocksForSlug) =>
        blocksForSlug.every((item) => {
          const b = currentBlocks.get(item.blockPath);
          return b == null || stableStringify(item.value) === stableStringify(b.value);
        }),
      );

      const accessToken = (await stableGetAccessToken()) || undefined;
      if (!isAllReset) setDraftSyncStatus("saving");

      const slugEntries = [...bySlug.entries()];
      const results = await Promise.allSettled(
        slugEntries.map(([slug, blocksForSlug]) => {
          const previous =
            inFlightDraftPerSlug.current.get(slug) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(() =>
              currentConfig.transport.updateDraft(
                { slug, blocks: blocksForSlug },
                { accessToken },
              ),
            );
          inFlightDraftPerSlug.current.set(slug, next);
          return next;
        }),
      );

      // Global discard during PUT: skip the optimistic draftValue update
      // entirely — `discardServerDrafts` already nullified draftValue
      // optimistically, so applying our stale sent-values here would
      // briefly re-populate it and fight the discard.
      if (discardGenRef.current !== genAtDispatch) {
        setDraftSyncStatus("idle");
        return;
      }

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
            console.warn("[inscribed] draft autosave failed:", r.reason);
          }
        }
        if (!isAllReset) flashDraftStatus("failed");
        return;
      }

      if (isAllReset) {
        setDraftSyncStatus("idle");
      } else {
        flashDraftStatus("saved");
      }
      }, 1000);
    };

    const unsubscribe = contentDraftsStore.subscribe(armDebounce);
    return () => {
      unsubscribe();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [contentDraftsStore, stableGetAccessToken, flashDraftStatus]);

  // Silent server-draft cleanup for the discard path. Fires a PUT with
  // each block's published value (the only knob the API gives us for
  // dropping a Redis draft — backend auto-cleans when draft===published)
  // but doesn't go through the autosave debounce or touch
  // `draftSyncStatus`. The pill therefore stays at its idle gray dot
  // instead of flashing "Kaydediliyor… → Taslak kayıtlı HH:MM" for a
  // request that conceptually removes a draft. Per-slug chaining mirrors
  // the autosave path so a discard issued mid-flight can't overtake a
  // still-pending autosave PUT for the same slug.
  const discardServerDrafts = useCallback(
    /** @param {string[]} blockPaths */
    (blockPaths) => {
      if (blockPaths.length === 0) return;
      /** @type {Map<string, import("../lib/schemas.js").UpdateBlockItem[]>} */
      const bySlug = new Map();
      const currentBlocks = blocksRef.current;
      const currentPathname = draftPathnameRef.current ?? "/";
      for (const blockPath of blockPaths) {
        const block = currentBlocks.get(blockPath);
        if (!block || block.draftValue == null) continue;
        const slug = block._slug ?? currentPathname;
        const list = bySlug.get(slug) ?? [];
        list.push({
          blockPath: block.blockPath,
          value: block.value,
          version: block.version,
        });
        bySlug.set(slug, list);
      }
      if (bySlug.size === 0) return;

      // Optimistic: nullify draftValue locally so dirtyCount drops to 0
      // and downstream surfaces (StatusBar, pill, ChangesPanel) update
      // immediately without waiting for the round-trip.
      setBlocksState((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const [, blocksForSlug] of bySlug) {
          for (const u of blocksForSlug) {
            const cur = next.get(u.blockPath);
            if (!cur || cur.draftValue == null) continue;
            next.set(u.blockPath, { ...cur, draftValue: null });
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });

      // Fire-and-forget cleanup PUTs. Per-slug chaining so concurrent
      // autosaves can't sneak a stale draft in after the cleanup lands.
      const currentConfig = draftConfigRef.current;
      (async () => {
        const accessToken = (await stableGetAccessToken()) || undefined;
        for (const [slug, blocksForSlug] of bySlug) {
          const previous =
            inFlightDraftPerSlug.current.get(slug) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(() =>
              currentConfig.transport.updateDraft(
                { slug, blocks: blocksForSlug },
                { accessToken },
              ),
            )
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn("[inscribed] discard cleanup PUT failed:", err);
            });
          inFlightDraftPerSlug.current.set(slug, next);
        }
      })();
    },
    [stableGetAccessToken],
  );

  const value = useMemo(
    () => ({
      config: normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      setBlocks: setBlocksState,
      // Live-edit drafts are NOT in the value: they live in
      // `contentDraftsStore` (stable ref) and consumers subscribe to their
      // own blockPath via `useStoreSelector`, so a keystroke doesn't
      // re-render every <EditableRegion> on the page.
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,
      activeBlock,
      setActiveBlock: setActiveBlockGuarded,
      activeListItem,
      setActiveListItem,
      refetchToken,
      triggerRefetch,
      itemSchemas: itemSchemasRef.current,
      registerItemSchema,
      unregisterItemSchema,
      editorVisibility,
      registerEditorVisibility,
      unregisterEditorVisibility,
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
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,
      activeBlock,
      setActiveBlockGuarded,
      activeListItem,
      refetchToken,
      triggerRefetch,
      itemSchemasVersion,
      registerItemSchema,
      unregisterItemSchema,
      editorVisibility,
      registerEditorVisibility,
      unregisterEditorVisibility,
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
      {themeCss ? <style>{themeCss}</style> : null}
      {/* Collections are an opt-in capability with their own provider/context
          (see `inscribed/collections`). It's mounted here so existing apps
          need no changes — both the page-side `<CollectionRegion>` /
          `<CollectionItem>` bindings (in `children`) and the drawer's
          collection tabs share one `CollectionContext`. It reads `config`,
          `isAdmin`, and `getAccessToken` back out of `CmsContext`, so it must
          live inside this provider. In a future major it becomes opt-in and
          collection-free apps tree-shake it out. */}
      <CollectionProvider>
        {/* Admin-only client refetch: `useCmsContent` GETs `/cms/content`
            with the user's Bearer so post-save `triggerRefetch` (and the
            draft autosave roundtrip) can pull fresh versions into the
            editor's view without a navigation. Public visitors don't
            mount this — soft-nav refreshes go through `router.refresh()`
            above, which re-runs the layout server-side with the service
            token. */}
        {isAdmin ? <ContentLoader /> : null}
        <div
          style={{
            marginLeft: contentOffset,
            transition: "margin-left 350ms cubic-bezier(0.32, 0.72, 0.18, 1)",
          }}
        >
          {children}
        </div>
        {isAdmin ? <AdminDrawer /> : null}
      </CollectionProvider>
    </CmsContext.Provider>
  );
}

// Must match PANEL_WIDTH inside AdminDrawer.jsx. Hardcoded here (rather than
// imported) so the constant stays out of the public bundle - AdminDrawer is
// dynamically imported and only loads for admins.
const ADMIN_PANEL_WIDTH = 460;

// Public visitors render entirely from `initialBlocks` (server-fetched and
// ISR-cached under `cmsCacheTag(slug)`); the cache is dropped on admin save
// via `revalidateCmsSlug`, so there is no reason to re-verify on every page
// view. Admin sessions still mount this so post-save `triggerRefetch` can
// pull fresh versions into the editor's view without a navigation.
function ContentLoader() {
  useCmsContent();
  return null;
}
