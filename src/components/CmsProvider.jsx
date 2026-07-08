"use client";

/**
 * @file Top-level provider owning CMS context state. Mount once near the root.
 * Holds the blocks map, active-block selection, draft autosave, and the refetch
 * token. The admin drawer is lazy-loaded so public visitors don't pay for it.
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
 * @param {CmsConfig | { baseUrl: string }} props.config
 * @param {string|null} [props.userSub]
 * @param {boolean} [props.isAdmin]
 * @param {BlockResponse[]} [props.initialBlocks]   Server-fetched blocks, seeded into the map before first paint to avoid SSR flicker.
 * @param {(slug: string) => void | Promise<void>} [props.onAfterSave]   Server Action run after a save, typically `revalidateTag(cmsCacheTag(slug))`.
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the user's JWT, added as `Authorization: Bearer` on writes. Omit in public mode.
 * @param {import("../lib/transport.js").CmsTransport} [props.transport]   Custom client transport. Defaults to REST from `config`. Passed here, not via `config`, because it holds functions that can't cross the RSC boundary.
 * @param {{ name: string|null, email: string|null, image: string|null } | null} [props.userInfo]   Identity for the admin panel footer. Null in public mode.
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
  // `config` arrives serializable across the RSC boundary. The transport holds
  // functions, so we build it here on the client and augment it onto the config
  // the tree reads through context. A custom `transport` prop overrides it.
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

  // Emit the theme overrides once as a `:root` block of `--ins-*` vars. At the
  // provider root (not the drawer) so page-side affordances pick them up too.
  const themeCss = useMemo(() => buildThemeCss(baseConfig.theme), [baseConfig.theme]);

  // Seed the blocks map from `initialBlocks` so EditableRegion renders real
  // values during SSR and first paint. Later updates flow through `useCmsContent`.
  const [blocks, setBlocksState] = useState(
    /** @returns {Map<string, BlockResponse>} */
    () => indexBlocksByPath(initialBlocks ?? []),
  );
  const [activeBlock, setActiveBlock] = useState(
    /** @type {string|null} */ (null),
  );
  // Drawer-side "open this list row" signal, set when a page-side
  // `<EditableList>` item is clicked; the matching card reads it once.
  const [activeListItem, setActiveListItem] = useState(
    /** @type {{ path: string, index: number } | null} */ (null),
  );
  const [refetchToken, setRefetchToken] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Per-blockPath unsaved edits (live-preview overlay). In an external store,
  // not React state, so a keystroke only re-renders the region subscribed to
  // that blockPath instead of every region on the page. `setDraftsState` keeps
  // the `setState(value | prev => next)` shape, so call sites are untouched.
  const contentDraftsStoreRef = useRef(
    /** @type {import("../lib/store.js").Store<Map<string, *>> | null} */ (null),
  );
  if (contentDraftsStoreRef.current === null) {
    contentDraftsStoreRef.current = createStore(new Map());
  }
  const contentDraftsStore = contentDraftsStoreRef.current;
  const setDraftsState = contentDraftsStore.set;

  // Registry of <EditableList> itemSchemas for the drawer's List editors. A
  // ref + rerender counter, not setState: register/unregister fires inside
  // child useEffects, which would otherwise warn about a setState mid-commit.
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

  // Registry of editor-visibility overrides from `<EditableRegion>`'s
  // `visible`/`editable` props (runtime-only, not in the manifest), so the
  // drawer learns to hide/lock a block. State-based so its block-list useMemo
  // recomputes when overrides come and go.
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

  // Re-seed the blocks map when `initialBlocks` arrives with new content (e.g.
  // navigation re-renders `<CmsPage>` for a new slug). Lazy init only runs once
  // on mount, so without this the panel would show stale blocks.
  const initialBlocksRef = useRef(initialBlocks);
  useEffect(() => {
    if (initialBlocks === initialBlocksRef.current) return;
    initialBlocksRef.current = initialBlocks;
    setBlocksState(indexBlocksByPath(initialBlocks ?? []));
    setActiveBlock(null);
    setDraftsState(new Map());
  }, [initialBlocks]);

  // Backstop: a root-layout `<CmsPage>` survives client navigation, so its
  // `initialBlocks` prop doesn't update on URL change. `router.refresh()`
  // re-runs the layout's server components, `getCmsPageBlocks` fetches for the
  // new pathname (via the `x-pathname` header), and the fresh blocks flow back
  // through the watcher above. Works for public visitors too, since the server
  // fetch uses the service token, not the user session.
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
  // removed one). Pathname-change drafts are already cleared above.
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

  // Stash callbacks in refs so prop changes don't bust the memoised context
  // value (and thus don't spuriously re-render consumers).
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
      // Closing cancels the in-progress edit so reopening lands on the block list.
      if (!open) setActiveBlock(null);
    },
    [],
  );

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
  // Each edit re-arms a 1s debounce; on fire we group dirty edits by slug and
  // PUT each. Block/version/config/pathname are read through refs so unrelated
  // re-renders don't reset the timer, only a real `drafts` mutation does.

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

  // Per-slug request chain: a fast typist can leave the previous PUT in flight,
  // so chaining each slug's request onto its predecessor keeps the backend in
  // commit order and stops an older draft clobbering a newer one. Different
  // slugs still save in parallel.
  const inFlightDraftPerSlug = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  // Pulse-and-reset for the status dot: drop back to idle ~0.9s after a
  // saved/failed signal so the flash is transient.
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

  // Drafts live in the store, so this effect subscribes (rather than depending
  // on `[drafts]`) and re-arms the debounce on each change.
  const autosaveTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  // Bumped on every discard so an in-flight autosave PUT can tell a discard
  // happened mid-await and skip the (now-wrong) "saved" flash.
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
      // (`draftValue ?? value`). Comparing against the effective value (not
      // `value`) is deliberate: an undo back to published while a server draft
      // exists must still send a request, so the backend draft gets cleared.
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

      // If every PUT block equals its published value (all undone to baseline),
      // treat it as a silent backend cleanup with no status flash.
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

      // Discard happened during the PUT: skip the optimistic update entirely.
      // `discardServerDrafts` already nulled draftValue, so applying our stale
      // sent-values here would briefly re-populate it and fight the discard.
      if (discardGenRef.current !== genAtDispatch) {
        setDraftSyncStatus("idle");
        return;
      }

      // Mirror the backend's post-write state locally: each PUT block gets
      // draftValue = the value sent, or null when that equals published (the
      // backend auto-cleans). Without it, an undo would keep `draftValue`
      // populated until the next refetch, leaving a stale dirty count.
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

  // Silent server-draft cleanup for discard. PUTs each block's published value
  // (the only way the API drops a Redis draft: it auto-cleans when
  // draft===published) without the debounce or `draftSyncStatus`, so the pill
  // doesn't flash a save for a request that removes a draft. Per-slug chaining
  // mirrors autosave so a mid-flight discard can't overtake a pending PUT.
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

      // Optimistic: null draftValue locally so dirtyCount and downstream
      // surfaces update without waiting for the round-trip.
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

      // Fire-and-forget cleanup PUTs, per-slug chained so a concurrent autosave
      // can't sneak a stale draft in after cleanup.
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
      // Live-edit drafts aren't in the value; they live in `contentDraftsStore`
      // so a keystroke doesn't re-render every consumer.
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
  // overlap content. Plain CSS transition keeps `framer-motion` in the
  // lazy-loaded admin chunk so public visitors don't pay for it.
  const contentOffset = isAdmin && isDrawerOpen ? ADMIN_PANEL_WIDTH : 0;

  return (
    <CmsContext.Provider value={value}>
      {themeCss ? <style>{themeCss}</style> : null}
      {/* Collections are opt-in (see `inscribed/collections`), mounted here so
          page bindings and the drawer's collection tabs share one
          `CollectionContext`. It reads `config`/`isAdmin`/`getAccessToken` from
          `CmsContext`, so it must live inside this provider. */}
      <CollectionProvider>
        {/* Admin-only client refetch so post-save `triggerRefetch` and the
            autosave roundtrip pull fresh versions in without a navigation.
            Public visitors refresh via `router.refresh()` above instead. */}
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

// Must match PANEL_WIDTH in AdminDrawer.jsx. Hardcoded, not imported, so it
// stays out of the public bundle (AdminDrawer is admin-only and lazy-loaded).
const ADMIN_PANEL_WIDTH = 460;

// Admin-only. Public visitors render from `initialBlocks` (ISR-cached, dropped
// on save via `revalidateCmsSlug`), so they never need this client refetch.
function ContentLoader() {
  useCmsContent();
  return null;
}
