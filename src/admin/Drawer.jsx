"use client";

/**
 * @file Slide-in admin panel for inline editing. Mounted only for admins
 * (gated by `CmsProvider`); always in the DOM but translated off-screen when
 * closed, with a chevron handle at x=0 to reopen.
 *
 * Layout: a left `ModeRail` (Sayfa / Koleksiyonlar) beside a pane column.
 * Collections are a top-level area, not per-page tabs: the rail opens every
 * collection the user can reach, while the page only points at the ones it
 * binds via `CollectionRefStrip`.
 *
 * Pane column (top to bottom):
 *   - Header:   mode badge + navigable path + status pill, on one row. The
 *               path's last segment is the title; ancestors route the host app
 *               (and in collections mode, step back to the list).
 *   - TabBar:   Sayfa / Genel, with a count badge and a dirty dot. Swapped for
 *               `PreviewHeader` while the changes overlay is open.
 *   - Toolbar:  block-list search (blockPath/blockType), page mode only.
 *   - Body:     per-tab block list, the collections list, or a region panel.
 *   - StatusBar: bottom lane: idle / saving / dirty (count + Geri al / Kaydet).
 *   - Footer:   user info + sign-out.
 *
 * Visual tokens live in `shared/style/tokens.js` and styles in `drawer-styles.js`; this file is
 * layout + state only.
 */

import { forwardRef, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ChevronsLeft, ChevronDown, ChevronLeft, ChevronRight,
  Check, Undo2, LogOut, Search, Eye, Pencil, FileText, Layers, Folder, TypeUnknown,
} from "../shared/style/icons.jsx";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useInert } from "../shared/ui/use-inert.js";
import { EMPTY_COLLECTION_STORE, useOptionalCollectionContext } from "../collections/context.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyBlocks, collectDirtyRecords, dirtyCollectionKeys } from "./dirty.js";
import { isBlockDirty } from "../core/resolve.js";
import { useCmsSave } from "../core/hooks/use-cms-save.js";
import { useCmsRoute } from "../core/hooks/use-cms-route.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { describeSaveError } from "./save-error.js";

import { BlockCard } from "./BlockCard.jsx";
import { ChangesPanel } from "./ChangesPanel.jsx";
import { Collapse } from "./Collapse.jsx";
import { PanelArea } from "./PanelArea.jsx";
import { readOpenTarget, stripOpenParams } from "./deep-link.js";

import { emptyStateStyle } from "../editors/styles.js";
import { panelStyle, DRAWER_BODY_CLASS, srOnlyStyle, paneContainerStyle, paneStyle, RAIL_CLASS, railButtonStyle, railDirtyDotStyle, railBadgeStyle, panelIconStyle, RAIL_BAR_CLASS, headerStyle, headerBadgeStyle, headerBadgeCollectionStyle, headerPathStyle, headerCrumbStyle, headerCrumbCurrentStyle, headerSepStyle, tabBarStyle, tabBarScrollStyle, tabBarChevronStyle, tabButtonStyle, tabButtonActiveStyle, tabLabelStyle, tabCountBadgeStyle, tabCountBadgeActiveStyle, tabDirtyDotStyle, toolbarStyle, searchWrapStyle, searchInputStyle, searchClearStyle, groupCardStyle, groupHeaderStyle, groupNameStyle, groupIconStyle, groupCountStyle, groupDirtyDotStyle, groupBodyStyle, groupRailStyle, groupDividerStyle, listStyle, statusBarStyle, statusSignalStyle, statusDotStyle, statusMsgStyle, statusMsgCleanStyle, statusMsgEmphasisStyle, statusActionsStyle, btnPrimaryStyle, btnGhostStyle, handleButtonStyle, handleIconStyle, PANEL_CLASS, footerStyle, avatarStyle, avatarImgStyle, avatarInitialsStyle, userMetaStyle, userNameStyle, userEmailStyle, signOutButtonStyle, errorStyle, conflictStyle, panelCss } from "./drawer-styles.js";
import { DRILL_TRANSITION, DRILL_PARALLAX, DRILL_PANE_TRANSITION, drillLayerStyle, drillPaneStyle } from "../shared/style/drill-motion.js";
import { PANEL_TRANSITION, ACCENT, COLLECTION_ACCENT, TEXT, TEXT_MID, TEXT_MUTED, TEXT_FAINT, HAIRLINE, SURFACE_1, SURFACE_2, R_MD, FONT_SANS, FONT_MONO, STATUS_OK, STATUS_WARN, STATUS_DANGER, dynamicSize } from "../shared/style/tokens.js";

// The two collections-mode panes carry the whole collections layer behind them
// (record cache, schema form, /me). Lazy so the drawer costs the same on a site
// without collections, where the rail button that opens them is hidden anyway.
const CollectionsPane = dynamic(
  () => import("./CollectionsPane.jsx").then((m) => m.CollectionsPane),
  { ssr: false },
);
const CollectionRegionPanel = dynamic(
  () => import("./CollectionRegionPanel.jsx").then((m) => m.CollectionRegionPanel),
  { ssr: false },
);

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/** @type {Map<string, BlockResponse>} */
const EMPTY_BLOCKS = new Map();


// Module scope so it stays identity-stable across renders: it stands in for
// `setActiveCollectionItem` in an effect's dependency list.
function noop() {}

/**
 * @param {{ panels?: readonly import("../shared/panels.js").CmsPanel[] | null }} props
 */
export function Drawer({ panels = null }) {
  const t = useCmsStrings();
  // `pathname` reads the blocks cache and labels the breadcrumb; `routeSlug` is
  // what `_slug` stamps carry, so it (not the pathname) decides page vs global.
  const { pathname, slug: routeSlug } = useCmsRoute();
  const {
    setActiveBlock,
    setPendingBlock,
    setDrawerOpen,
    blocksStore,
    contentDraftsStore,
    uiStore,
    registryStore,
    userInfo,
    onSignOut,
  } = useCmsContext();
  // The drawer aggregates over everything, so unlike a page region it selects
  // whole slices. As a single admin surface, re-rendering on each write is fine
  // as long as the memoised card list below can still bail out.
  const blocks = useStoreSelector(blocksStore, (s) => s.get(pathname) ?? EMPTY_BLOCKS);
  const drafts = useStoreSelector(contentDraftsStore, (m) => m);
  const activeBlock = useStoreSelector(uiStore, (s) => s.activeBlock);
  const pendingBlock = useStoreSelector(uiStore, (s) => s.pendingBlock);
  const isDrawerOpen = useStoreSelector(uiStore, (s) => s.isDrawerOpen);
  const draftSyncStatus = useStoreSelector(uiStore, (s) => s.draftSyncStatus);
  // Size, not the set: the banner only counts, and selecting the set itself
  // would re-render the whole drawer on every resolution.
  const unresolvedConflicts = useStoreSelector(uiStore, (s) => s.conflictBlocks.size);
  const itemSchemas = useStoreSelector(registryStore, (s) => s.itemSchemas);
  const editorVisibility = useStoreSelector(registryStore, (s) => s.editorVisibility);
  // Collections are opt-in, so this is the one admin surface that must render
  // without them. Read off the store rather than `useMyCollections()`, which
  // throws by design when the provider is absent.
  const collectionCtx = useOptionalCollectionContext();
  const collectionStore = collectionCtx?.collectionStore ?? EMPTY_COLLECTION_STORE;
  const setActiveCollectionItem = collectionCtx?.setActiveCollectionItem ?? noop;
  const activeCollectionItem = useStoreSelector(collectionStore, (s) => s.activeItem);
  const collectionBindings = useStoreSelector(collectionStore, (s) => s.bindings);
  const collectionListCache = useStoreSelector(collectionStore, (s) => s.listCache);
  const collectionItemCache = useStoreSelector(collectionStore, (s) => s.itemCache);
  const collectionDrafts = useStoreSelector(collectionStore, (s) => s.drafts);
  const myCollections = useStoreSelector(collectionStore, (s) => s.meta.order);
  const {
    dirtyCount, isSaving, error, translationPreviews,
    save: onSaveAll, discard: onDiscardAll,
  } = useCmsSave();
  // Header path ancestors navigate the host app; the drawer already follows the
  // route via `usePathname`, so it re-renders into the new page on its own.
  const router = useRouter();

  // Warm the Tiptap chunk in the background once the admin surface mounts, so
  // the first RichText edit (drawer card or in-place) doesn't stall ~1-2s on the
  // lazy import. Admin-only path already; idle so it never competes with paint.
  useEffect(() => {
    const prefetch = () => { import("../editors/rich-text/RichTextEditor.jsx").catch(() => {}); };
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    if (ric) {
      const id = ric(prefetch, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(prefetch, 800);
    return () => clearTimeout(timer);
  }, []);

  // Search filter (path + type), Page/Global tabs only; Collection lanes
  // filter inside their own panel.
  const [search, setSearch] = useState("");

  // Split blocks into page/global lists. Deliberately independent of `drafts`:
  // the drawer re-renders on every keystroke, and if these arrays were rebuilt
  // each time, the memoised card list below would never get to bail out.
  // CollectionItem bindings are synthesised in as virtual Collection blocks.
  const { pageBlockList, globalBlockList } = useMemo(() => {
    /** @type {BlockResponse[]} */
    const pages = [];
    /** @type {BlockResponse[]} */
    const globals = [];

    for (const block of blocks.values()) {
      // `visible={false}` regions register as "hidden": drop them entirely.
      if (editorVisibility.get(block.blockPath) === "hidden") continue;

      const slug = block._slug ?? routeSlug;
      (slug === routeSlug ? pages : globals).push(block);
    }
    pages.sort((a, b) => a.sortOrder - b.sortOrder);
    globals.sort((a, b) => a.sortOrder - b.sortOrder);

    let nextSort = pages.length > 0 ? pages[pages.length - 1].sortOrder + 1 : 1;
    for (const [bindingId, binding] of collectionBindings) {
      if (!binding.slug) continue;
      // A region's rows already have a home: the reference row below lists the
      // window and drills into them. Only a record placed directly on the page
      // earns its own card.
      if (binding.fromRegion) continue;
      // Same rule the block loop applies above: a record inside a hidden group
      // leaves the drawer entirely.
      if (editorVisibility.get(bindingId) === "hidden") continue;
      pages.push(/** @type {BlockResponse} */ ({
        blockPath: bindingId,
        blockType: "Collection",
        value: binding,
        version: 0,
        sortOrder: nextSort++,
        _slug: routeSlug,
        // Group and label ride along on the binding: a collection row's path
        // addresses a record, so unlike a content block it has nowhere to
        // carry either.
        _group: binding.group ?? null,
        _label: binding.label,
      }));
    }

    return { pageBlockList: pages, globalBlockList: globals };
  }, [blocks, routeSlug, collectionBindings, editorVisibility]);

  // Per-block dirty flag for the rail dot, tab dots and preview counts. Its own
  // memo (rebuilt per keystroke) so it can't drag the block lists with it. Cards
  // don't read it: each one derives its own dirty state from its own draft.
  const dirtyByPath = useMemo(() => collectDirtyBlocks(blocks, drafts), [blocks, drafts]);

  // Collections this page binds as a region and the user can reach (per /me).
  // These are reference rows in the page list, not tabs: a collection is a
  // top-level area reached from the rail, and the page only points at it.
  const pageCollectionRefs = useMemo(() => {
    /** @type {Set<string>} */
    const pageRegions = new Set();
    for (const [, binding] of collectionBindings) {
      if (binding.slug) continue;
      pageRegions.add(binding.collection);
    }
    /** @type {{ label: string, count: number, key: string }[]} */
    const out = [];
    for (const my of myCollections) {
      if (!pageRegions.has(my.collectionKey)) continue;
      // List cache keys are `"{key}|{params}"`, so scan by prefix and take the
      // largest `total` (the unfiltered size once the Region tab is opened).
      const listPrefix = `${my.collectionKey}|`;
      let total = 0;
      for (const [k, entry] of collectionListCache) {
        if (k.startsWith(listPrefix)) total = Math.max(total, entry.total);
      }
      out.push({ label: my.collectionKey, count: total, key: my.collectionKey });
    }
    return out;
  }, [collectionBindings, myCollections, collectionListCache]);

  // Per-key dirty flag for the tab dot, unioning the live overlay map and
  // cached items carrying server `draftData`. The cache pass is needed because
  // the overlay clears once autosave lands, which would otherwise drop the dot.
  const collectionDirtyByKey = useMemo(
    () => dirtyCollectionKeys(collectDirtyRecords(collectionDrafts, collectionItemCache)),
    [collectionDrafts, collectionItemCache],
  );

  const pageDirty = pageBlockList.some((b) => dirtyByPath.get(b.blockPath));
  const globalDirty = globalBlockList.some((b) => dirtyByPath.get(b.blockPath));

  // Diff-able dirty count for "Önizle": page + global, minus Collection synth
  // blocks (their dirty state surfaces in the region tab, not the block preview).
  const previewableCount = useMemo(() => {
    let n = 0;
    for (const b of pageBlockList) {
      if (b.blockType === "Collection") continue;
      if (dirtyByPath.get(b.blockPath)) n++;
    }
    for (const b of globalBlockList) {
      if (dirtyByPath.get(b.blockPath)) n++;
    }
    // Staged translations publish with the same button, so a preview that left
    // them out would review less than Kaydet sends, and the count beside it
    // would disagree with the status bar's.
    return n + translationPreviews.length;
  }, [pageBlockList, globalBlockList, dirtyByPath, translationPreviews]);

  // Per-collection dirty slug sets (overlay map + cached items with a server
  // draft), for the preview overlay's summary banner. Items never loaded into
  // the cache stay invisible, which is fine since they weren't opened.
  const collectionDirtyCounts = useMemo(() => {
    /** @type {Map<string, Set<string>>} */
    const out = new Map();
    /** @param {string} key @param {string} slug */
    const add = (key, slug) => {
      let set = out.get(key);
      if (!set) { set = new Set(); out.set(key, set); }
      set.add(slug);
    };
    for (const draftKey of collectionDrafts.keys()) {
      const i = draftKey.indexOf(":");
      if (i <= 0) continue;
      add(draftKey.slice(0, i), draftKey.slice(i + 1));
    }
    for (const [cacheKey, entry] of collectionItemCache) {
      if (!entry.item || entry.item.draftData == null) continue;
      const i = cacheKey.indexOf(":");
      if (i <= 0) continue;
      add(cacheKey.slice(0, i), cacheKey.slice(i + 1));
    }
    return out;
  }, [collectionDrafts, collectionItemCache]);

  const collectionDirtyTotal = useMemo(() => {
    let n = 0;
    for (const set of collectionDirtyCounts.values()) n += set.size;
    return n;
  }, [collectionDirtyCounts]);

  // First dirty (key, slug) for the "Aç" CTA. Map iteration mirrors tab order,
  // so this is predictable, not random.
  const firstDirtyCollectionTarget = useMemo(() => {
    for (const [key, slugs] of collectionDirtyCounts) {
      const slug = slugs.values().next().value;
      if (slug) return { key, slug };
    }
    return null;
  }, [collectionDirtyCounts]);

  // Drives Önizle visibility and the auto-close-on-clean effect.
  const anyPreviewable = previewableCount + collectionDirtyTotal > 0;

  const allTabs = useMemo(
    () => [
      { id: "page", label: t("drawer.page"), count: pageBlockList.length, dirty: pageDirty },
      ...(globalBlockList.length > 0
        ? [{ id: "global", label: t("drawer.global"), count: globalBlockList.length, dirty: globalDirty }]
        : []),
    ],
    [pageBlockList.length, globalBlockList.length, pageDirty, globalDirty, t],
  );

  // Rail mode. Collections is a top-level area (everything the user can reach,
  // not just what this page binds), so it carries its own selection instead of
  // living in the page's tab bar. `scope` decides whether the opened panel
  // shows the whole collection or only this page's bound sections.
  //
  // An open string rather than a union: a custom panel's mode is its own `id`,
  // which is why `normalizePanels` refuses "page" and "collections".
  const [mode, setModeState] = useState(/** @type {string} */ ("page"));
  const activePanel = panels?.find((panel) => panel.id === mode) ?? null;
  const [selectedCollection, setSelectedCollection] = useState(
    /** @type {{ key: string, scope: "page"|"global" } | null} */ (null),
  );

  const [activeTab, setActiveTabState] = useState(/** @type {string} */ ("page"));
  // Preview overlay: renders `ChangesPanel` in the body slot instead of the
  // active tab. Auto-closes when dirty drains to 0 or the user switches tabs.
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (isPreviewOpen && !anyPreviewable) setPreviewOpen(false);
  }, [isPreviewOpen, anyPreviewable]);
  /** @param {string} tab */
  const setActiveTab = (tab) => {
    if (isPreviewOpen) setPreviewOpen(false);
    setActiveTabState(tab);
  };

  /** @param {string} next */
  const setMode = (next) => {
    if (isPreviewOpen) setPreviewOpen(false);
    setModeState(next);
  };

  // Per-panel rail marks. Deliberately not folded into the dirty counts: a
  // panel's pending work is its own, and the Save button below speaks only for
  // versioned content blocks.
  const [panelBadges, setPanelBadges] = useState(
    /** @type {Map<string, number|boolean|null>} */ (new Map()),
  );
  const setPanelBadge = useCallback(
    /** @param {string} panelId @param {number|boolean|null} value */
    (panelId, value) => {
      setPanelBadges((prev) => {
        if ((prev.get(panelId) ?? null) === (value ?? null)) return prev;
        const next = new Map(prev);
        if (value == null || value === false) next.delete(panelId);
        else next.set(panelId, value);
        return next;
      });
    },
    [],
  );

  // Where each panel says it currently is. The trail is the panel's own view
  // stack reported upward, which is why it replaces the header path rather than
  // extending it: inside a panel, the route is not what the user navigated.
  const [panelCrumbs, setPanelCrumbsState] = useState(
    /** @type {Map<string, { label: string, onClick?: () => void }[]>} */ (new Map()),
  );
  const setPanelCrumbs = useCallback(
    /** @param {string} panelId @param {{ label: string, onClick?: () => void }[] | null} trail */
    (panelId, trail) => {
      setPanelCrumbsState((prev) => {
        if (trail == null || trail.length === 0) {
          if (!prev.has(panelId)) return prev;
          const next = new Map(prev);
          next.delete(panelId);
          return next;
        }
        const next = new Map(prev);
        next.set(panelId, trail);
        return next;
      });
    },
    [],
  );

  // A link into the admin surface (see `deep-link.js`). Read once on mount:
  // everything it can address is known by then, and in the built-in auth flow
  // the drawer only mounts once the session has resolved, so a marker that
  // rode through a sign-in is still here waiting.
  const openedFromUrlRef = useRef(false);
  useEffect(() => {
    if (openedFromUrlRef.current) return;
    openedFromUrlRef.current = true;

    const { target, warning } = readOpenTarget(window.location.search);
    const reject = (text) => {
      if (process.env.NODE_ENV === "production") return;
      // eslint-disable-next-line no-console
      console.warn(`[inscribed] ${text}`);
    };
    if (warning && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(warning);
    }
    if (!target) {
      if (warning) stripOpenParams();
      return;
    }

    switch (target.kind) {
      case "block":
        // Through the pending signal rather than straight to `activeBlock`: on
        // arrival the route's content may still be settling, and this waits for
        // the block instead of selecting nothing.
        setPendingBlock(target.blockPath);
        break;
      case "record":
      case "collection":
        if (!collectionCtx) {
          reject(`?cms-${target.kind}= needs the collections provider, which this app has not opted into.`);
          break;
        }
        setModeState("collections");
        setSelectedCollection({ key: target.collectionKey, scope: "global" });
        if (target.kind === "record") {
          setActiveCollectionItem({ key: target.collectionKey, slug: target.slug });
        }
        break;
      default:
        if (!panels?.some((panel) => panel.id === target.panelId)) {
          reject(`?cms-panel=${target.panelId} names no registered panel.`);
          break;
        }
        setModeState(target.panelId);
    }

    setDrawerOpen(true);
    stripOpenParams();
  }, [panels, collectionCtx, setDrawerOpen, setPendingBlock, setActiveCollectionItem]);

  // The host's panel list can change between renders (a route that offers one
  // area, a session that loses it). Same failsafe as the tab effect below.
  useEffect(() => {
    if (mode === "page" || mode === "collections") return;
    if (panels?.some((panel) => panel.id === mode)) return;
    setModeState("page");
  }, [mode, panels]);

  // Stable identity so the memoised collections list isn't re-rendered by every
  // drawer re-render: the drawer subscribes to the whole drafts map, so it
  // re-renders on each keystroke in any field.
  const selectCollectionFromList = useCallback(
    /** @param {string} key */
    (key) => setSelectedCollection({ key, scope: "global" }),
    [],
  );

  // If the active tab disappears (e.g. navigating off a page with a Region
  // binding), fall back to "page". Raw setter so a routing event doesn't also
  // close an open preview.
  useEffect(() => {
    if (allTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTabState("page");
  }, [allTabs, activeTab]);

  // Failsafe for the "Aç" signal: the card normally consumes and clears it on
  // mount, but if the target slug sits past a paginated window the card never
  // mounts. Drop the signal when the user leaves the target tab so it can't
  // fire stale on a later "Load more".
  useEffect(() => {
    if (!activeCollectionItem) return;
    if (mode === "collections" && selectedCollection?.key === activeCollectionItem.key) return;
    setActiveCollectionItem(null);
  }, [mode, selectedCollection, activeCollectionItem, setActiveCollectionItem]);

  // Every row the drawer renders, synthesised collection bindings included, so
  // "which group holds this path" answers for both block kinds. The raw
  // `blocks` map can't: collection rows never enter the content namespace.
  const rowsByPath = useMemo(() => {
    /** @type {Map<string, BlockResponse>} */
    const map = new Map();
    for (const block of pageBlockList) map.set(block.blockPath, block);
    for (const block of globalBlockList) map.set(block.blockPath, block);
    return map;
  }, [pageBlockList, globalBlockList]);

  // Per-group collapse state. Storing the *closed* set means new groups from
  // discovery default to expanded.
  const [closedGroups, setClosedGroups] = useState(/** @type {Set<string>} */ (new Set()));

  // Read through refs so `toggleGroup` keeps a stable identity: it is a prop of
  // the memoised block list, which a keystroke-driven shell re-render must not
  // invalidate.
  const closedGroupsRef = useRef(closedGroups);
  closedGroupsRef.current = closedGroups;
  const activeBlockRef = useRef(activeBlock);
  activeBlockRef.current = activeBlock;
  const rowsByPathRef = useRef(rowsByPath);
  rowsByPathRef.current = rowsByPath;

  const toggleGroup = useCallback(
    /** @param {string} group */
    (group) => {
      const closing = !closedGroupsRef.current.has(group);
      setClosedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
      });
      const active = activeBlockRef.current;
      const activeRow = active ? rowsByPathRef.current.get(active) : undefined;
      if (closing && activeRow && groupOfBlock(activeRow) === group) {
        setActiveBlock(null);
      }
    },
    [setActiveBlock],
  );

  // When an EditableRegion is clicked, open the panel and switch to its tab so
  // the matching card scrolls into view instead of hiding behind another tab.
  useEffect(() => {
    if (!activeBlock) return;
    if (!isDrawerOpen) setDrawerOpen(true);
    // A page region was clicked, so leave whatever rail mode was open: the
    // matching card lives in the page list.
    setModeState("page");
    const block = rowsByPath.get(activeBlock);
    if (!block) return;
    const slug = block._slug ?? routeSlug;
    const tab = slug === routeSlug ? "page" : "global";
    setActiveTab(tab);
    const group = groupOfBlock(block);
    if (group == null) return;
    setClosedGroups((prev) => {
      if (!prev.has(group)) return prev;
      const next = new Set(prev);
      next.delete(group);
      return next;
    });
  }, [activeBlock, rowsByPath, routeSlug, isDrawerOpen, setDrawerOpen]);

  // A `?cms-block=` link asked for a block that is not on screen yet. Promote
  // it the moment it turns up and the effect above takes it from there: on
  // arrival the route's content may still be settling, and a link that selected
  // nothing would look broken to whoever was sent it.
  //
  // The failsafe is the other half: a path that never arrives must not sit
  // waiting to fire on some unrelated page later. Once we are somewhere other
  // than where the request was made and that route's rows have loaded without
  // it, the jump has missed and the signal is dropped.
  const pendingBornAtRef = useRef(/** @type {string|null} */ (null));
  useEffect(() => {
    if (!pendingBlock) {
      pendingBornAtRef.current = null;
      return;
    }
    pendingBornAtRef.current ??= pathname;
    if (rowsByPath.has(pendingBlock)) {
      setPendingBlock(null);
      setActiveBlock(pendingBlock);
      return;
    }
    if (pathname !== pendingBornAtRef.current && rowsByPath.size > 0) {
      setPendingBlock(null);
    }
  }, [pendingBlock, rowsByPath, pathname, setPendingBlock, setActiveBlock]);

  // Wall-clock time of the last successful autosave, echoed as "Taslak kayıtlı
  // HH:MM" once dirty drains.
  const [lastSavedAt, setLastSavedAt] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    if (draftSyncStatus === "saved") {
      const now = new Date();
      setLastSavedAt(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
    } else if (draftSyncStatus === "idle" && dirtyCount === 0) {
      setLastSavedAt(null);
    }
  }, [draftSyncStatus, dirtyCount]);

  // Transient "Veri kaydedildi" pulse after a successful publish (`onSaveAll`),
  // distinct from `lastSavedAt` (which tracks draft autosaves). Detected on the
  // `isSaving` true->false edge with no error and dirty drained to 0.
  const [publishedFlash, setPublishedFlash] = useState(false);
  const prevIsSavingRef = useRef(false);
  useEffect(() => {
    const wasSaving = prevIsSavingRef.current;
    prevIsSavingRef.current = isSaving;
    if (!wasSaving || isSaving) return;
    if (error) return;
    if (dirtyCount !== 0) return;
    // Kaydet only publishes content blocks. If collection drafts are
    // still pending in a region tab, "Veri kaydedildi" would overstate
    // what actually happened. Stay silent until everything is clean.
    if (collectionDirtyTotal !== 0) return;
    setPublishedFlash(true);
    // The publish emptied the draft slot, so clear the timestamp; otherwise the
    // pill would fall back to a stale "Taslak kayıtlı" once the flash closes.
    setLastSavedAt(null);
  }, [isSaving, error, dirtyCount, collectionDirtyTotal]);
  useEffect(() => {
    if (!publishedFlash) return undefined;
    const timer = setTimeout(() => setPublishedFlash(false), 2400);
    return () => clearTimeout(timer);
  }, [publishedFlash]);
  // A new autosave or returning to dirty invalidates the "Veri kaydedildi"
  // flash, since the data no longer matches the just-published state.
  useEffect(() => {
    if (draftSyncStatus === "saving" || dirtyCount > 0) setPublishedFlash(false);
  }, [draftSyncStatus, dirtyCount]);

  const saveError = describeSaveError(error, t, unresolvedConflicts);
  const pathSegments = pathnameToSegments(pathname);

  const matchSearch = (block) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return block.blockPath.toLowerCase().includes(q)
        || (block._label ?? "").toLowerCase().includes(q)
        || block.blockType.toLowerCase().includes(q);
  };

  const filteredPage = useMemo(
    () => pageBlockList.filter(matchSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageBlockList, search],
  );
  const filteredGlobal = useMemo(
    () => globalBlockList.filter(matchSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalBlockList, search],
  );

  const bodyRef = useInert(!isDrawerOpen);

  const tabsId = useId();
  const blockPanelId = `${tabsId}-blocks`;

  return (
    <MotionConfig reducedMotion="user">
      <style>{panelCss}</style>
      <motion.aside
        initial={false}
        className={PANEL_CLASS}
        // A percentage of the panel's own box, so the offset follows whatever
        // width the breakpoints left it.
        animate={{ x: isDrawerOpen ? "0%" : "-100%" }}
        transition={PANEL_TRANSITION}
        style={panelStyle}
      >
        {/* The handle is deliberately outside: it is what reopens the panel, so
            it must stay reachable while everything else is inert. */}
        <div ref={bodyRef} className={DRAWER_BODY_CLASS} aria-hidden={!isDrawerOpen}>
          <ModeRail
            mode={mode}
            onChange={setMode}
            showCollections={collectionCtx !== null}
            pageDirty={pageDirty || globalDirty}
            collectionsDirty={collectionDirtyTotal > 0}
            panels={panels}
            panelBadges={panelBadges}
          />
  
          <div style={paneContainerStyle}>
            <PanelHeader
              mode={mode}
              panel={activePanel}
              panelTrail={activePanel ? panelCrumbs.get(activePanel.id) ?? null : null}
              segments={pathSegments}
              collectionKey={selectedCollection?.key ?? null}
              onNavigate={(href) => router.push(href)}
              onBackToCollections={() => setSelectedCollection(null)}
              dirty={dirtyCount > 0}
              draftSyncStatus={draftSyncStatus}
              isSaving={isSaving}
              lastSavedAt={lastSavedAt}
              publishedFlash={publishedFlash}
            />
  
            {mode === "collections" || activePanel ? (
              // No bar here: the header path's `collections /` segment is the way
              // back, so a second one would just repeat it. A custom panel gets
              // none either, since whatever it needs above its list is its own.
              null
            ) : isPreviewOpen ? (
              <PreviewHeader
                count={previewableCount + collectionDirtyTotal}
                onBack={() => setPreviewOpen(false)}
              />
            ) : (
              <TabBar
                tabs={allTabs}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={tabsId}
                panelId={blockPanelId}
              />
            )}
  
            {activePanel ? null : mode === "collections" ? (
              <CollectionsMode
                selected={selectedCollection}
                onSelect={selectCollectionFromList}
                collections={myCollections}
                dirtyKeys={collectionDirtyByKey}
              />
            ) : isPreviewOpen ? (
              <ChangesPanel
                blockList={[...pageBlockList, ...globalBlockList]}
                drafts={drafts}
                dirtyByPath={dirtyByPath}
                itemSchemas={itemSchemas}
                collectionDirtyCounts={collectionDirtyCounts}
                translationPreviews={translationPreviews}
                onGoToBlock={(block) => {
                  setPreviewOpen(false);
                  const scope = (block._slug ?? routeSlug) === routeSlug ? "page" : "global";
                  setActiveTabState(scope);
                  setActiveBlock(block.blockPath);
                }}
                onGoToCollection={(collectionKey) => {
                  setPreviewOpen(false);
                  setModeState("collections");
                  setSelectedCollection({ key: collectionKey, scope: "global" });
                }}
              />
            ) : (
              <>
                <Toolbar value={search} onChange={setSearch} />
                {activeTab === "page" && pageCollectionRefs.length > 0 && !search ? (
                  <CollectionRefStrip
                    refs={pageCollectionRefs}
                    dirtyKeys={collectionDirtyByKey}
                    onOpen={(key) => {
                      // Page-scoped: the reference means "the list rendered on
                      // this page", so keep the page's filters rather than
                      // dropping the user into the whole collection.
                      setModeState("collections");
                      setSelectedCollection({ key, scope: "page" });
                    }}
                  />
                ) : null}
                <GroupedBlockList
                  panelId={blockPanelId}
                  labelledBy={`${tabsId}-${activeTab}`}
                  blockList={activeTab === "page" ? filteredPage : filteredGlobal}
                  activeBlockPath={activeBlock}
                  itemSchemas={itemSchemas}
                  editorVisibility={editorVisibility}
                  closedGroups={closedGroups}
                  onToggleGroup={toggleGroup}
                  emptyHint={
                    search
                      ? t("drawer.emptySearch", { query: search })
                      : activeTab === "page"
                        ? t("drawer.emptyPage")
                        : t("drawer.emptyGlobal")
                  }
                />
              </>
            )}
  
            {/* Outside the branch above on purpose: a panel is mounted on first
                open and then kept, so switching to the page and back must not
                unmount it. It hides itself while another area is on screen. */}
            {panels ? (
              <PanelArea
                panels={panels}
                activeId={activePanel?.id ?? null}
                onBadge={setPanelBadge}
                onCrumbs={setPanelCrumbs}
              />
            ) : null}
  
            {/* The banner carries its own height, so the status bar below is
                pushed down and pulled back by plain reflow. It used to fade while
                holding full height and leave the travel to a `layout` on the bar:
                the bar re-measured on every drawer render (which is every
                keystroke, and every navigation), so it drifted for reasons that
                had nothing to do with this banner. */}
            <Collapse show={saveError != null}>
              <div
                role="alert"
                style={saveError?.tone === "conflict" ? conflictStyle : errorStyle}
              >
                {saveError?.text}
              </div>
            </Collapse>
  
            {/* Its own box, so `StatusBar`'s FLIP on the action buttons keeps
                measuring against something it owns rather than the panel column. */}
            <div style={{ flexShrink: 0 }}>
            <StatusBar
              dirtyCount={dirtyCount}
              collectionDirtyCount={collectionDirtyTotal}
              firstDirtyCollectionTarget={firstDirtyCollectionTarget}
              onGoToCollection={(target) => {
                setModeState("collections");
                setSelectedCollection({ key: target.key, scope: "global" });
                // Signal the panel to open the item's detail pane once it mounts
                // (it reads `activeCollectionItem` on first paint).
                setActiveCollectionItem({ key: target.key, slug: target.slug });
              }}
              isSaving={isSaving}
              draftSyncStatus={draftSyncStatus}
              onDiscardAll={() => {
                onDiscardAll();
                // Clear the "Taslak kayıtlı HH:MM" indicator: the server draft is
                // gone, so the timestamp would point at nothing.
                setLastSavedAt(null);
              }}
              onSaveAll={onSaveAll}
              previewableCount={previewableCount + collectionDirtyTotal}
              isPreviewOpen={isPreviewOpen}
              onTogglePreview={() => setPreviewOpen((v) => !v)}
            />
            </div>
  
            {userInfo ? (
              <PanelFooter userInfo={userInfo} onSignOut={onSignOut} />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          className="inscribed-handle"
          style={handleButtonStyle}
          aria-label={isDrawerOpen ? t("drawer.closePanel") : t("drawer.openPanel")}
          aria-expanded={isDrawerOpen}
          title={isDrawerOpen ? t("drawer.closePanel") : t("drawer.openPanel")}
        >
          <span
            className="inscribed-handle-slide"
            style={{ ...handleIconStyle, "--slide-x": isDrawerOpen ? "-3px" : "3px" }}
          >
            <motion.span
              initial={false}
              animate={{ rotate: isDrawerOpen ? 0 : 180 }}
              transition={{ duration: 0.25, ease: PANEL_TRANSITION.ease }}
              style={handleIconStyle}
            >
              <ChevronsLeft size={14} />
            </motion.span>
          </span>
        </button>
      </motion.aside>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------
// Mode rail
// ---------------------------------------------------------------------------

/**
 * Top-level area switch, down the panel's left edge or across its top depending
 * on which of the two the shell can spare. Icon-only (labels live in the
 * tooltip); the dot marks unsaved work waiting in an area the user isn't
 * currently looking at.
 *
 * Custom panels follow the built-in areas, in the order the app registered
 * them, and carry a badge of their own rather than a dirty dot: what is pending
 * in one is the panel's business, not this drawer's Save.
 *
 * @param {{
 *   mode: string,
 *   onChange: (mode: string) => void,
 *   showCollections: boolean,
 *   pageDirty: boolean,
 *   collectionsDirty: boolean,
 *   panels: readonly import("../shared/panels.js").CmsPanel[] | null,
 *   panelBadges: Map<string, number|boolean|null>,
 * }} props
 */
function ModeRail({
  mode, onChange, showCollections, pageDirty, collectionsDirty, panels, panelBadges,
}) {
  const t = useCmsStrings();
  return (
    <nav className={RAIL_CLASS} aria-label={t("drawer.sections")}>
      <RailButton
        icon={<FileText size={17} />}
        label={t("drawer.page")}
        active={mode === "page"}
        dirty={pageDirty}
        accent={ACCENT}
        onClick={() => onChange("page")}
      />
      {/* Hidden without the provider: there is no area behind it. An app that
          opted in keeps it even while /me is empty. */}
      {showCollections ? (
        <RailButton
          icon={<Layers size={17} />}
          label={t("drawer.collections")}
          active={mode === "collections"}
          dirty={collectionsDirty}
          accent={COLLECTION_ACCENT}
          tintIcon
          onClick={() => onChange("collections")}
        />
      ) : null}
      {panels?.map((panel) => (
        <RailButton
          key={panel.id}
          icon={<PanelIcon icon={panel.icon} size={17} />}
          label={panelLabel(panel, t)}
          active={mode === panel.id}
          dirty={false}
          badge={panelBadges.get(panel.id) ?? null}
          accent={panel.accent ?? ACCENT}
          // A panel that named no colour reads like the page area rather than
          // borrowing an emphasis it did not ask for.
          tintIcon={Boolean(panel.accent)}
          onClick={() => onChange(panel.id)}
        />
      ))}
    </nav>
  );
}

/**
 * @param {{
 *   icon: React.ReactNode,
 *   label: string,
 *   active: boolean,
 *   dirty: boolean,
 *   badge?: number|boolean|null,
 *   accent: string,
 *   tintIcon?: boolean,
 *   onClick: () => void,
 * }} props
 */
function RailButton({ icon, label, active, dirty, badge = null, accent, tintIcon, onClick }) {
  const t = useCmsStrings();
  const className = ["inscribed-rail-btn", active ? "is-active" : null]
    .filter(Boolean).join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      // Inline rather than a per-area CSS class: a panel's accent is an
      // arbitrary colour from the app, so there is no rule to write ahead of
      // time. Inline wins over `.is-active`, which is what leaves the untinted
      // areas on the stylesheet's neutral.
      style={active && tintIcon ? { ...railButtonStyle, color: accent } : railButtonStyle}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      title={label}
    >
      {active ? (
        // Shared `layoutId`: mounting this in the newly active button makes
        // framer slide the bar from the old one instead of swapping it.
        <motion.span
          layoutId="inscribed-rail-indicator"
          aria-hidden="true"
          className={RAIL_BAR_CLASS}
          style={{ background: accent }}
          transition={RAIL_TRANSITION}
        />
      ) : null}
      <motion.span
        initial={false}
        animate={{ scale: active ? 1 : 0.9 }}
        transition={RAIL_TRANSITION}
        style={{ display: "inline-flex" }}
      >
        {icon}
      </motion.span>
      {typeof badge === "number" && badge > 0 ? (
        <span style={{ ...railBadgeStyle, background: accent }}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : badge || dirty ? (
        <span
          style={{ ...railDirtyDotStyle, background: accent }}
          aria-label={dirty ? t("drawer.unsavedDot") : t("drawer.pendingDot")}
        />
      ) : null}
    </button>
  );
}

/**
 * A panel's glyph, drawn into a box we size. The host's node is arbitrary JSX,
 * so the sizing is done on the wrapper (plus the `> svg` rule in `panelCss`)
 * rather than by handing it a `size` prop it may not take.
 *
 * @param {{ icon: React.ReactNode, size: number }} props
 */
function PanelIcon({ icon, size }) {
  if (icon == null) return <TypeUnknown size={size} />;
  return (
    <span className="inscribed-panel-icon" style={{ ...panelIconStyle, width: size, height: size }}>
      {icon}
    </span>
  );
}

/**
 * The area's name: written as given, or looked up when the app chose to put it
 * in `adminStrings` instead. `label` is deliberately not passed through `t`,
 * since a plain word is not a key and would warn on every render.
 *
 * @param {import("../shared/panels.js").CmsPanel} panel
 * @param {import("../shared/i18n/translate.js").Translate} t
 * @returns {string}
 */
function panelLabel(panel, t) {
  return panel.labelKey ? t(panel.labelKey) : /** @type {string} */ (panel.label);
}

// Rail motion: a short spring so the indicator slide and the icon settle feel
// like one gesture rather than two eased tweens.
const RAIL_TRANSITION = /** @type {const} */ ({
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.7,
});

// ---------------------------------------------------------------------------
// Collections mode
// ---------------------------------------------------------------------------

// Mirrors the region panel's own list/detail choreography one level up, so
// drilling from the collections list into a collection reads as the same
// gesture as drilling from a collection into an item. The values live in
// `shared/style/drill-motion.js`: a custom panel's view stack drills the same
// way, and the two must not drift apart.

/**
 * Body slot for Collections mode: the list layer recedes while the chosen
 * collection slides over it. Both layers stay mounted through the transition,
 * which is why this owns a positioned frame instead of swapping children.
 *
 * Once a collection is open, a strip of the user's other collections rides
 * above it for lateral switching, so hopping between them doesn't mean going
 * back out to the list first.
 *
 * @param {{
 *   selected: { key: string, scope: "page"|"global" } | null,
 *   onSelect: (collectionKey: string) => void,
 *   collections: import("../shared/contracts/schemas.js").MyCollectionResponse[],
 *   dirtyKeys: Set<string>,
 * }} props
 */
function CollectionsMode({ selected, onSelect, collections, dirtyKeys }) {
  const isOpen = selected != null;
  const tabsId = useId();
  const panelId = `${tabsId}-collection`;

  return (
    <section style={{ ...paneStyle, position: "relative", overflow: "hidden" }}>
      <motion.div
        initial={false}
        animate={isOpen
          ? { x: DRILL_PARALLAX, opacity: 0.4 }
          : { x: "0%", opacity: 1 }}
        transition={DRILL_TRANSITION}
        style={{
          ...drillLayerStyle,
          // The opaque pane covers the layer at rest; this only guards clicks
          // and tab focus during the transition frames.
          pointerEvents: isOpen ? "none" : "auto",
        }}
        aria-hidden={isOpen}
      >
        <CollectionsPane onSelect={onSelect} />
      </motion.div>

      {/* `initial={false}`: switching to the page and back remounts this whole
          mode, and without it the already-open collection would replay its
          entrance every time. Opening one from the list still animates, since
          that child is added after mount rather than present on first render. */}
      <AnimatePresence initial={false}>
        {selected ? (
          // The key is deliberately constant: the slide is the "went inside"
          // gesture, so switching collections from the strip must not replay it.
          // Only the panel below remounts, which still drops any open item pane.
          <motion.div
            key="collection-pane"
            initial={{ x: "-100%" }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={DRILL_PANE_TRANSITION}
            style={drillPaneStyle}
          >
            <TabBar
              tabs={collections.map((c) => ({
                id: c.collectionKey,
                label: c.collectionKey,
                dirty: dirtyKeys.has(c.collectionKey),
              }))}
              activeTab={selected.key}
              // Re-selecting the active tab would re-open it in global scope
              // and silently drop a page-scoped arrival's filter.
              onChange={(key) => { if (key !== selected.key) onSelect(key); }}
              accent={COLLECTION_ACCENT}
              idPrefix={tabsId}
              panelId={panelId}
            />
            <CollectionRegionPanel
              key={selected.key}
              collectionKey={selected.key}
              scope={selected.scope}
              panelId={panelId}
              labelledBy={`${tabsId}-${selected.key}`}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   mode: string,
 *   panel: import("../shared/panels.js").CmsPanel | null,
 *   panelTrail: { label: string, onClick?: () => void }[] | null,
 *   segments: { label: string, href: string }[],
 *   collectionKey: string | null,
 *   onNavigate: (href: string) => void,
 *   onBackToCollections: () => void,
 *   dirty: boolean,
 *   draftSyncStatus: "idle"|"saving"|"saved"|"failed",
 *   isSaving: boolean,
 *   lastSavedAt: string | null,
 *   publishedFlash: boolean,
 * }} props
 */
function PanelHeader({
  mode, panel, panelTrail, segments, collectionKey, onNavigate, onBackToCollections,
  dirty, draftSyncStatus, isSaving, lastSavedAt, publishedFlash,
}) {
  const t = useCmsStrings();
  const isCollections = mode === "collections";

  const crumbs = buildCrumbs({
    isCollections, panel, panelTrail, segments, collectionKey, t, onNavigate, onBackToCollections,
  });

  // Leading crumbs that survived the move keep their key, so only the tail past
  // this point animates.
  const keys = crumbs.map((c) => c.key);
  const previousKeys = useRef(keys);
  let shared = 0;
  while (
    shared < keys.length
    && shared < previousKeys.current.length
    && keys[shared] === previousKeys.current[shared]
  ) shared += 1;
  useEffect(() => {
    previousKeys.current = keys;
  });

  return (
    <header style={headerStyle}>
      <span
        style={headerBadgeStyleFor(isCollections, panel)}
        aria-hidden="true"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={mode}
            variants={rollVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={ROLL_TRANSITION}
            style={rollLayerStyle}
          >
            {panel
              ? <PanelIcon icon={panel.icon} size={12} />
              : isCollections ? <Layers size={12} /> : <FileText size={12} />}
          </motion.span>
        </AnimatePresence>
      </span>

      <nav style={headerPathRollStyle} aria-label={t("drawer.location")}>
        {/* Switching area turns the whole path as one drum; moving within an
            area animates only the crumbs that changed. The inner presence
            remounts with the area, so `initial={false}` keeps its crumbs from
            replaying inside a drum that is already turning. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={mode}
            variants={rollVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={ROLL_TRANSITION}
            style={rollRowStyle}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {crumbs.map((crumb, i) => (
                <HeaderCrumb
                  key={crumb.key}
                  crumb={crumb}
                  showSeparator={i > 0}
                  enterDelay={Math.max(0, i - shared) * CRUMB_STEP}
                  // Deepest-first on the way out.
                  exitDelay={(crumbs.length - 1 - i) * CRUMB_STEP}
                />
              ))}
            </AnimatePresence>
          </motion.span>
        </AnimatePresence>
      </nav>

      <HeaderStatusPill
        dirty={dirty}
        draftSyncStatus={draftSyncStatus}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        publishedFlash={publishedFlash}
      />

    </header>
  );
}

// Always one way: Page and Collections are neighbouring areas, so deriving a
// direction from their depth had the drum reverse whenever the collection
// happened to have a record open. Past ~35° the tilt reads as distortion.
const rollVariants = {
  enter: { y: 12, rotateX: 34, scale: 0.94, opacity: 0 },
  center: { y: 0, rotateX: 0, scale: 1, opacity: 1 },
  exit: { y: -12, rotateX: -34, scale: 0.94, opacity: 0 },
};

// Opacity is the short one, so the two labels never overlap as readable text.
const ROLL_TRANSITION = {
  y: { duration: 0.3, ease: PANEL_TRANSITION.ease },
  rotateX: { duration: 0.3, ease: PANEL_TRANSITION.ease },
  scale: { duration: 0.3, ease: PANEL_TRANSITION.ease },
  opacity: { duration: 0.16, ease: "linear" },
};

// The perspective is what makes the tilt read as rotation instead of a squash.
const headerBadgeRollStyle = /** @type {React.CSSProperties} */ ({
  overflow: "hidden",
  perspective: 220,
});

/**
 * The badge's fill for the current area. A custom panel's accent is arbitrary,
 * so its soft tint is mixed here rather than read off a token, using the same
 * 14% the built-in `*_SOFT` tokens are built with.
 *
 * @param {boolean} isCollections
 * @param {import("../shared/panels.js").CmsPanel | null} panel
 * @returns {React.CSSProperties}
 */
function headerBadgeStyleFor(isCollections, panel) {
  const base = { ...headerBadgeStyle, ...headerBadgeRollStyle };
  if (panel) {
    return panel.accent
      ? {
          ...base,
          background: `color-mix(in srgb, ${panel.accent} 14%, transparent)`,
          color: panel.accent,
        }
      : base;
  }
  return isCollections ? { ...base, ...headerBadgeCollectionStyle } : base;
}

const headerPathRollStyle = /** @type {React.CSSProperties} */ ({
  ...headerPathStyle,
  perspective: 600,
});

const rollLayerStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

// Carries the gap between crumbs, which is tight because they already have
// their own padding.
const rollRowStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
});

const CRUMB_STEP = 0.05;

// Both ends sit below the line: appearing already means "went deeper" and
// leaving means "came back", so the crumb needs no direction of its own.
const CRUMB_HIDDEN = { opacity: 0, y: 9, rotateX: 32, scale: 0.9 };
const CRUMB_SHOWN = { opacity: 1, y: 0, rotateX: 0, scale: 1 };
const CRUMB_ENTER = { duration: 0.26, ease: PANEL_TRANSITION.ease };
const CRUMB_EXIT = { duration: 0.2, ease: PANEL_TRANSITION.ease };

/**
 * One crumb and the separator before it. `forwardRef` is required: `popLayout`
 * pins the outgoing child out of the flow through a ref, and swallowing it
 * leaves the mode nothing to measure.
 *
 * @type {React.ForwardRefExoticComponent<{
 *   crumb: { key: string, label: string, title?: string, current?: boolean, onClick?: () => void },
 *   showSeparator: boolean,
 *   enterDelay: number,
 *   exitDelay: number,
 * } & React.RefAttributes<HTMLSpanElement>>}
 */
const HeaderCrumb = forwardRef(function HeaderCrumb(
  { crumb, showSeparator, enterDelay, exitDelay }, ref,
) {
  // Frozen at mount: the delay collapses to zero once the effect records the
  // new keys, and a fresh transition mid-flight restarts the animation.
  const enter = useRef(enterDelay).current;
  const enterTransition = useMemo(
    () => ({ ...CRUMB_ENTER, delay: enter }),
    [enter],
  );
  const exitTarget = useMemo(
    () => ({ ...CRUMB_HIDDEN, transition: { ...CRUMB_EXIT, delay: exitDelay } }),
    [exitDelay],
  );

  return (
    <motion.span
      ref={ref}
      initial={CRUMB_HIDDEN}
      animate={CRUMB_SHOWN}
      exit={exitTarget}
      transition={enterTransition}
      style={crumbWrapStyle}
    >
      {showSeparator ? <span style={headerSepStyle}>/</span> : null}
      {crumb.onClick ? (
        <Crumb label={crumb.label} title={crumb.title} onClick={crumb.onClick} />
      ) : (
        <span
          style={crumb.current ? headerCrumbCurrentStyle : { ...headerCrumbStyle, cursor: "default" }}
          title={crumb.title}
        >
          {crumb.label}
        </span>
      )}
    </motion.span>
  );
});

// Deep paths collapse their middle rather than wrapping. Keeping the last two
// segments preserves the "which section am I in" cue that a bare filename loses.
const MAX_VISIBLE_SEGMENTS = 2;

/**
 * The path as data rather than markup, so the header can diff one location
 * against the next by key. A crumb with no `onClick` renders as text.
 *
 * @param {{
 *   isCollections: boolean,
 *   panel: import("../shared/panels.js").CmsPanel | null,
 *   panelTrail: { label: string, onClick?: () => void }[] | null,
 *   segments: { label: string, href: string }[],
 *   collectionKey: string | null,
 *   t: (key: string, vars?: Record<string, *>) => string,
 *   onNavigate: (href: string) => void,
 *   onBackToCollections: () => void,
 * }} args
 * @returns {{ key: string, label: string, title?: string, current?: boolean, onClick?: () => void }[]}
 */
function buildCrumbs({ isCollections, panel, panelTrail, segments, collectionKey, t, onNavigate, onBackToCollections }) {
  // Inside a panel the path is not the route: the panel owns its own views, so
  // what the header shows is the trail it reported (via `<PanelStack>` or
  // `setCrumbs`). With none reported it is one level deep, and its name is the
  // whole path.
  if (panel) {
    if (!panelTrail || panelTrail.length === 0) {
      const label = panelLabel(panel, t);
      return [{ key: `panel:${panel.id}`, label, title: label, current: true }];
    }
    return panelTrail.map((crumb, i) => {
      const isLast = i === panelTrail.length - 1;
      return {
        // Position and text both, so re-labelling one level animates just that
        // crumb while its ancestors stay put.
        key: `panel:${panel.id}:${i}:${crumb.label}`,
        label: crumb.label,
        title: crumb.label,
        current: isLast,
        onClick: isLast ? undefined : crumb.onClick,
      };
    });
  }

  if (isCollections) {
    // The area's own landing page reads like the site root on `/`: a crumb, not
    // an emphasised current segment, and with nowhere to navigate from.
    const head = collectionKey
      ? { key: "collections", label: t("drawer.collections"), title: t("drawer.collectionList"), onClick: onBackToCollections }
      : { key: "collections", label: t("drawer.collections") };
    return collectionKey
      ? [head, { key: `collection:${collectionKey}`, label: collectionKey, title: collectionKey, current: true }]
      : [head];
  }

  const isCollapsed = segments.length > MAX_VISIBLE_SEGMENTS;
  const shown = isCollapsed ? segments.slice(-MAX_VISIBLE_SEGMENTS) : segments;
  const hidden = isCollapsed ? segments.slice(0, -MAX_VISIBLE_SEGMENTS) : [];

  const crumbs = [
    { key: "root", label: t("drawer.home"), title: t("drawer.home"), onClick: () => onNavigate("/") },
  ];
  if (isCollapsed) {
    // Jumps to the deepest hidden ancestor; the title spells out what was
    // folded away so the path stays readable.
    crumbs.push({
      key: "ellipsis",
      label: "…",
      title: hidden.map((s) => s.label).join(" / "),
      onClick: () => onNavigate(hidden[hidden.length - 1].href),
    });
  }
  shown.forEach((segment, i) => {
    const isLast = i === shown.length - 1;
    crumbs.push({
      key: segment.href,
      label: segment.label,
      title: isLast ? segment.label : segment.href,
      current: isLast,
      onClick: isLast ? undefined : () => onNavigate(segment.href),
    });
  });
  return crumbs;
}

/**
 * @param {{ label: string, title: string, onClick: () => void }} props
 */
function Crumb({ label, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inscribed-crumb"
      style={headerCrumbStyle}
      title={title}
    >
      {label}
    </button>
  );
}

const crumbWrapStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  minWidth: 0,
});

/**
 * Header pill surfacing the page-level autosave state: coloured dot + label +
 * (when present) a wall-clock timestamp. Mirrors the bottom StatusBar's dot
 * tones and typography on purpose.
 *
 * @param {{
 *   dirty: boolean,
 *   draftSyncStatus: "idle"|"saving"|"saved"|"failed",
 *   isSaving: boolean,
 *   lastSavedAt: string | null,
 *   publishedFlash: boolean,
 * }} props
 */
function HeaderStatusPill({ dirty, draftSyncStatus, isSaving, lastSavedAt, publishedFlash }) {
  const t = useCmsStrings();
  // Two different things go over the wire, and only one of them is a draft.
  // Folding them into a single "syncing" flag is what had a publish announce
  // itself as an autosave.
  const isDraftSaving = draftSyncStatus === "saving";
  const isFailed = draftSyncStatus === "failed";

  /** @type {{ state: string, bg: string, glow: string, pulse: boolean, label: React.ReactNode, title: string }} */
  let view;

  if (isFailed) {
    view = {
      state: "failed",
      bg: STATUS_DANGER,
      glow: "none",
      pulse: false,
      label: t("pill.failed"),
      title: t("pill.failedTitle"),
    };
  } else if (publishedFlash) {
    // Post-publish pulse: drafts are now live data, so "Veri kaydedildi" shows
    // for a couple of seconds before falling back to the idle dot.
    view = {
      state: "published",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: t("pill.published"),
      title: t("pill.publishedTitle"),
    };
  } else if (isSaving) {
    // Above `lastSavedAt` on purpose: a publish held under it kept showing
    // "Taslak kayıtlı HH:MM" with a working dot, which names the wrong write
    // and points at a timestamp the publish is in the middle of invalidating.
    view = {
      state: "publishing",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: t("pill.publishing"),
      title: t("pill.publishingTitle"),
    };
  } else if (lastSavedAt) {
    // Hold the label steady during re-saves; only the dot pulses and recolours.
    // The timestamp slides when the minute changes (same value, same key, no anim).
    view = {
      state: "saved",
      bg: isDraftSaving ? STATUS_WARN : STATUS_OK,
      glow: isDraftSaving ? `0 0 5px ${STATUS_WARN}66` : `0 0 5px ${STATUS_OK}66`,
      pulse: isDraftSaving,
      label: (
        <>
          {t("pill.draftSaved")}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={lastSavedAt}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.14, ease: [0.32, 0.72, 0.18, 1] }}
              style={{ ...headerPillTimeStyle, display: "inline-block" }}
            >
              {lastSavedAt}
            </motion.span>
          </AnimatePresence>
        </>
      ),
      title: t("pill.draftSavedTitle", { time: lastSavedAt }),
    };
  } else if (isDraftSaving) {
    // First autosave ever, no prior timestamp to anchor to.
    view = {
      state: "saving",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: t("pill.draftSaving"),
      title: t("pill.draftSavingTitle"),
    };
  } else if (dirty) {
    view = {
      state: "dirty",
      bg: ACCENT,
      glow: `0 0 5px ${ACCENT}66`,
      pulse: false,
      label: t("pill.dirty"),
      title: t("pill.dirtyTitle"),
    };
  } else {
    // Idle baseline: pill stays mounted as a dot-only chip so the
    // surface has a steady anchor in the header. Label animates in on
    // top of it when state arrives.
    view = {
      state: "idle",
      bg: TEXT_FAINT,
      glow: "none",
      pulse: false,
      label: null,
      title: "",
    };
  }

  // Re-measure the layout FLIP only when the pill's content actually changes.
  // Without this, every drawer re-render (e.g. an image resize spamming draft
  // updates) re-measures mid-reflow and the pill twitches vertically.
  const pillLayoutKey = `${view.state}|${lastSavedAt ?? ""}`;

  return (
    <motion.div
      layout
      layoutDependency={pillLayoutKey}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
      style={{ ...headerPillStyle, transformOrigin: "center", overflow: "hidden" }}
      title={view.title}
    >
      <motion.span
        layout
        layoutDependency={pillLayoutKey}
        className={view.pulse ? "inscribed-status-pulse" : undefined}
        style={{ ...headerPillDotStyle, background: view.bg, boxShadow: view.glow }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {view.label != null ? (
          <motion.span
            key={view.state}
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0.18, 1] }}
            style={headerPillLabelStyle}
          >
            {view.label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

const headerPillStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  // Lock vertical size so the dot-only state matches the label height; only the
  // horizontal axis animates, no vertical jitter.
  minHeight: 22,
  padding: "0 8px",
  borderRadius: 99,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  flexShrink: 0,
  alignSelf: "center",
});

const headerPillDotStyle = /** @type {React.CSSProperties} */ ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  flexShrink: 0,
  display: "inline-block",
  transition: "background 220ms ease, box-shadow 220ms ease",
});

const headerPillLabelStyle = /** @type {React.CSSProperties} */ ({
  fontSize: dynamicSize(12),
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
});

const headerPillTimeStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  fontSize: dynamicSize(11),
  color: TEXT_FAINT,
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   tabs: { id: string, label: string, count?: number, dirty?: boolean }[],
 *   activeTab: string,
 *   onChange: (tab: string) => void,
 *   accent?: string,
 *   idPrefix?: string,
 *   panelId?: string,
 * }} props
 *   `idPrefix` names each tab `${idPrefix}-${tab.id}` so the body it switches
 *   can point back at the current one; `panelId` is that body. Both are
 *   optional, and without them the strip is a tablist with no panel bound.
 */
function TabBar({ tabs, activeTab, onChange, accent = ACCENT, idPrefix, panelId }) {
  const t = useCmsStrings();
  const scrollRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [indicator, setIndicator] = useState(/** @type {{ left: number, width: number, color: string } | null} */ (null));

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs, measure]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-tab-id="${CSS.escape(activeTab)}"]`);
    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, color: accent });
    }
    requestAnimationFrame(measure);
  }, [activeTab, tabs, measure, accent]);

  const nudge = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  /** @param {React.KeyboardEvent} e */
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const jump = { Home: 0, End: tabs.length - 1 }[e.key];
    const at = tabs.findIndex((tab) => tab.id === activeTab);
    let next = -1;
    if (step != null && at !== -1) next = (at + step + tabs.length) % tabs.length;
    else if (jump != null) next = jump;
    if (next === -1 || !tabs[next]) return;
    e.preventDefault();
    onChange(tabs[next].id);
    // Selection follows focus, so the newly current tab has to take it too.
    scrollRef.current
      ?.querySelector(`[data-tab-id="${CSS.escape(tabs[next].id)}"]`)
      ?.focus();
  };

  return (
    <div style={tabBarStyle}>
      {overflow.left ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="inscribed-tabbar-chevron"
          style={tabBarChevronStyle}
          aria-label={t("drawer.tabsPrev")}
        >
          <ChevronLeft size={14} />
        </button>
      ) : null}
      <div
        ref={scrollRef}
        role="tablist"
        className="inscribed-tabbar-scroll"
        style={{ ...tabBarScrollStyle, position: "relative" }}
        onScroll={measure}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            domId={idPrefix ? `${idPrefix}-${tab.id}` : undefined}
            panelId={panelId}
            label={tab.label}
            count={tab.count}
            dirty={Boolean(tab.dirty)}
            active={activeTab === tab.id}
            accent={accent}
            onClick={() => onChange(tab.id)}
          />
        ))}
        {indicator ? (
          <span
            aria-hidden="true"
            className="inscribed-tab-indicator"
            style={{
              position: "absolute",
              bottom: -1,
              left: indicator.left,
              width: indicator.width,
              height: 2,
              background: indicator.color,
              borderRadius: 1,
              transition: "left 200ms cubic-bezier(0.32, 0.72, 0.18, 1), width 200ms cubic-bezier(0.32, 0.72, 0.18, 1), background-color 180ms ease",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {overflow.right ? (
        <button
          type="button"
          onClick={() => nudge(1)}
          className="inscribed-tabbar-chevron"
          style={tabBarChevronStyle}
          aria-label={t("drawer.tabsNext")}
        >
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   id: string, domId?: string, panelId?: string, label: string, count?: number,
 *   active: boolean, dirty: boolean, accent?: string, onClick: () => void,
 * }} props
 */
function TabButton({ id, domId, panelId, label, count, active, dirty, accent = ACCENT, onClick }) {
  const t = useCmsStrings();
  const activeStyle = active
    ? { ...tabButtonStyle, ...tabButtonActiveStyle }
    : tabButtonStyle;
  return (
    <button
      type="button"
      role="tab"
      id={domId}
      data-tab-id={id}
      aria-selected={active}
      aria-controls={panelId}
      // Roving: the strip is one tab stop, and the arrow keys move within it.
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className="inscribed-tab"
      style={activeStyle}
    >
      <span style={tabLabelStyle}>{label}</span>
      {count != null ? (
        <span
          style={active ? { ...tabCountBadgeStyle, ...tabCountBadgeActiveStyle } : tabCountBadgeStyle}
        >
          {count}
        </span>
      ) : null}
      {dirty ? (
        <span
          style={accent === ACCENT
            ? tabDirtyDotStyle
            : { ...tabDirtyDotStyle, background: accent, boxShadow: `0 0 4px ${accent}80` }}
          aria-label={t("drawer.unsavedDot")}
        />
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (search)
// ---------------------------------------------------------------------------

/**
 * @param {{ value: string, onChange: (v: string) => void }} props
 */
function Toolbar({ value, onChange }) {
  const t = useCmsStrings();
  return (
    <div style={toolbarStyle}>
      <div className="inscribed-search" style={searchWrapStyle}>
        <Search size={13} color={TEXT_FAINT} />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("drawer.searchPlaceholder")}
          aria-label={t("drawer.searchLabel")}
          style={searchInputStyle}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inscribed-search-clear"
            style={searchClearStyle}
            aria-label={t("drawer.searchClear")}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

/**
 * Memoised, and every prop it takes is stable across a keystroke: cards read
 * their own draft from the store, so the drawer shell can re-render for the
 * dirty count without dragging the editor tree (Tiptap, image, list) with it.
 *
 * @param {{
 *   blockList: BlockResponse[],
 *   activeBlockPath: string | null,
 *   itemSchemas: Map<string, import("../shared/contracts/schemas.js").ItemSchema>,
 *   editorVisibility: Map<string, "hidden"|"readonly">,
 *   closedGroups: Set<string>,
 *   onToggleGroup: (group: string) => void,
 *   emptyHint: string,
 *   panelId?: string,
 *   labelledBy?: string,
 * }} props
 */
const GroupedBlockList = memo(function GroupedBlockList({
  blockList, activeBlockPath,
  itemSchemas, editorVisibility, closedGroups, onToggleGroup, emptyHint,
  panelId, labelledBy,
}) {
  const chunks = useMemo(() => chunkBlocksByGroup(blockList), [blockList]);

  return (
    <section
      style={paneStyle}
      id={panelId}
      role={panelId ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
    >
      {blockList.length === 0 ? (
        <div style={emptyStateStyle}>{emptyHint}</div>
      ) : (
        <ul style={listStyle} data-cms-list>
          {chunks.map((chunk, i) => {
            const row = chunk.type === "single" ? (
              <li key={`s:${chunk.block.blockPath}`} style={{ listStyle: "none" }}>
                <BlockCard
                  block={chunk.block}
                  displayPath={displayLabelOf(chunk.block, null)}
                  topLevel
                  isActive={activeBlockPath === chunk.block.blockPath}
                  itemSchema={itemSchemas.get(chunk.block.blockPath) ?? null}
                  readOnly={editorVisibility.get(chunk.block.blockPath) === "readonly"}
                />
              </li>
            ) : (
              <li key={`g:${chunk.name}`} style={{ listStyle: "none" }}>
                <GroupCard
                  groupName={chunk.name}
                  blocks={chunk.blocks}
                  activeBlockPath={activeBlockPath}
                  itemSchemas={itemSchemas}
                  editorVisibility={editorVisibility}
                  isOpen={!closedGroups.has(chunk.name)}
                  onToggle={() => onToggleGroup(chunk.name)}
                />
              </li>
            );
            // Close a group with a rule when another block follows, so where the
            // group ends and the next block begins reads at a glance.
            const closer = chunk.type === "group" && i < chunks.length - 1
              ? <li key={`d:${chunk.name}`} aria-hidden="true" style={groupDividerStyle} />
              : null;
            return closer ? [row, closer] : row;
          })}
        </ul>
      )}
    </section>
  );
});

/**
 * @param {{
 *   groupName: string,
 *   blocks: BlockResponse[],
 *   activeBlockPath: string | null,
 *   itemSchemas: Map<string, import("../shared/contracts/schemas.js").ItemSchema>,
 *   editorVisibility: Map<string, "hidden"|"readonly">,
 *   isOpen: boolean,
 *   onToggle: () => void,
 * }} props
 */
function GroupCard({
  groupName, blocks, activeBlockPath,
  itemSchemas, editorVisibility, isOpen, onToggle,
}) {
  const t = useCmsStrings();
  // The header dot is derived here rather than handed down: a `dirtyByPath` prop
  // would change identity on every keystroke and defeat the list's memo. The
  // selector returns a boolean, so a write outside this group is a no-op.
  const { contentDraftsStore } = useCmsContext();
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const dirty = useStoreSelector(contentDraftsStore, (m) => {
    for (const block of blocksRef.current) {
      if (isBlockDirty(block, m.has(block.blockPath), m.get(block.blockPath))) return true;
    }
    return false;
  });

  return (
    <div style={groupCardStyle}>
      <button type="button" className="inscribed-group-header" style={groupHeaderStyle} onClick={onToggle} aria-expanded={isOpen}>
        <span style={groupIconStyle} aria-hidden="true">
          <Folder size={13} />
        </span>
        <span style={groupNameStyle}>{groupName}</span>
        <span style={groupCountStyle}>
          {blocks.length}
          {dirty ? <span style={groupDirtyDotStyle} aria-label={t("drawer.unsavedDot")} /> : null}
        </span>
        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED }}
        >
          <ChevronDown size={13} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={groupBodyStyle}>
              <span aria-hidden="true" style={groupRailStyle} />
              {blocks.map((block) => (
                <BlockCard
                  key={block.blockPath}
                  block={block}
                  displayPath={displayLabelOf(block, groupName)}
                  topLevel={false}
                  isActive={activeBlockPath === block.blockPath}
                  itemSchema={itemSchemas.get(block.blockPath) ?? null}
                  readOnly={editorVisibility.get(block.blockPath) === "readonly"}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Which group card a row belongs to, `null` for a flat one. The two block kinds
 * carry it differently: a content block's group is the slice of its path before
 * the first dot (the prefix `<CmsGroup>` bakes in, which discovery mirrors),
 * while a collection row's path addresses a record, so its group travels on the
 * binding instead.
 *
 * @param {BlockResponse} block
 * @returns {string | null}
 */
function groupOfBlock(block) {
  if (block.blockType === "Collection") return block._group ?? null;
  const dot = block.blockPath.indexOf(".");
  return dot === -1 ? null : block.blockPath.slice(0, dot);
}

/**
 * What the row's label reads. Content rows show their path, minus the group
 * prefix inside a group card so a child of "hero" reads as `cover`, not
 * `hero.cover` (the full path stays in the row's title). Collection rows show
 * the binding's label, their path being an identifier rather than a place.
 * `undefined` means "the path as-is".
 *
 * @param {BlockResponse} block
 * @param {string | null} groupName
 * @returns {string | undefined}
 */
function displayLabelOf(block, groupName) {
  if (block.blockType === "Collection") return block._label;
  if (!groupName) return undefined;
  const p = `${groupName}.`;
  return block.blockPath.startsWith(p) ? block.blockPath.slice(p.length) : block.blockPath;
}

/**
 * @typedef {{ type: "single", block: BlockResponse }
 *         | { type: "group", name: string, blocks: BlockResponse[] }} BlockChunk
 */

/**
 * @param {BlockResponse[]} blocks
 * @returns {BlockChunk[]}
 */
function chunkBlocksByGroup(blocks) {
  /** @type {BlockChunk[]} */
  const chunks = [];
  /** @type {Map<string, number>} */
  const groupChunkIndex = new Map();

  for (const block of blocks) {
    const group = groupOfBlock(block);
    if (group == null) {
      chunks.push({ type: "single", block });
      continue;
    }
    const existing = groupChunkIndex.get(group);
    if (existing != null) {
      const chunk = chunks[existing];
      if (chunk.type === "group") chunk.blocks.push(block);
      continue;
    }
    groupChunkIndex.set(group, chunks.length);
    chunks.push({ type: "group", name: group, blocks: [block] });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

/**
 * Replaces the tab bar while the preview overlay is open. Matches its height +
 * border so the body doesn't reflow; left chip goes back, right chip is a
 * passive label + count.
 *
 * @param {{ count: number, onBack: () => void }} props
 */
function PreviewHeader({ count, onBack }) {
  const t = useCmsStrings();
  return (
    <div style={previewHeaderStyle}>
      <button
        type="button"
        onClick={onBack}
        className="inscribed-preview-back"
        style={previewBackStyle}
        aria-label={t("drawer.backToEditing")}
      >
        <ChevronLeft size={12} />
        <span>{t("drawer.backToEditing")}</span>
      </button>
      <div style={previewTitleStyle}>
        <span>{t("drawer.previewTitle", { count })}</span>
      </div>
    </div>
  );
}

/**
 * Page-side pointer to the collections this page renders as regions. Now that
 * collections are a rail area instead of page tabs, this keeps "the list on
 * this page" one click away; opening a row stays page-scoped so the page's
 * filters survive the jump.
 *
 * @param {{
 *   refs: { key: string, label: string, count: number }[],
 *   dirtyKeys: Set<string>,
 *   onOpen: (key: string) => void,
 * }} props
 */
function CollectionRefStrip({ refs, dirtyKeys, onOpen }) {
  const t = useCmsStrings();
  return (
    <div style={refStripStyle}>
      {refs.map((ref) => (
        <button
          key={ref.key}
          type="button"
          onClick={() => onOpen(ref.key)}
          className="inscribed-collection-ref"
          style={refRowStyle}
        >
          <span style={refIconStyle}>
            <Layers size={12} />
          </span>
          <span style={refLabelStyle} title={ref.key}>{ref.label}</span>
          {ref.count > 0 ? <span style={refCountStyle}>{ref.count}</span> : null}
          {dirtyKeys.has(ref.key) ? (
            <span style={refDirtyDotStyle} aria-label={t("drawer.unsavedDot")} />
          ) : null}
          <span style={refChevronStyle} aria-hidden="true">
            <ChevronRight size={12} />
          </span>
        </button>
      ))}
    </div>
  );
}

const refStripStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "0 16px 8px",
});

const refRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "7px 10px",
  borderRadius: R_MD,
  border: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
});

const refIconStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: COLLECTION_ACCENT,
  flexShrink: 0,
});

const refLabelStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  color: TEXT_MID,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const refCountStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  padding: "2px 6px",
  borderRadius: 99,
  background: SURFACE_2,
  color: TEXT_FAINT,
  flexShrink: 0,
});

const refDirtyDotStyle = /** @type {React.CSSProperties} */ ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
  flexShrink: 0,
});

const refChevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: TEXT_FAINT,
  flexShrink: 0,
});

// Shared enter/exit choreography for StatusBar action buttons: a small upward
// slide on enter, fade out on exit, with `layout` handling the horizontal
// stagger as sibling buttons appear/disappear. Mirrors the header pill's easing.
const statusActionMotion = /** @type {const} */ ({
  layout: true,
  initial: { opacity: 0, y: 4, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.96 },
  transition: { duration: 0.18, ease: [0.32, 0.72, 0.18, 1] },
});

const previewHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "stretch",
  justifyContent: "space-between",
  padding: "0 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
});

const previewBackStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: 0,
  padding: "10px 8px",
  marginLeft: -8,
  color: TEXT,
  fontWeight: 500,
  fontSize: dynamicSize(12),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  cursor: "pointer",
  fontFamily: "inherit",
});

const previewTitleStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: TEXT_MUTED,
  fontWeight: 400,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
});

/**
 * Single-line rolling counter: on change the old number slides out and the new
 * one in (up when rising, down when falling), masked by an `overflow: hidden`
 * wrapper. `style` carries the text appearance.
 *
 * @param {{ value: number, style?: React.CSSProperties }} props
 */
function RollingCount({ value, style }) {
  const prevRef = useRef(value);
  const direction = value >= prevRef.current ? 1 : -1;
  useEffect(() => {
    prevRef.current = value;
  }, [value]);
  return (
    <span
      style={{
        ...style,
        display: "inline-flex",
        position: "relative",
        overflow: "hidden",
        verticalAlign: "bottom",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: direction > 0 ? "100%" : "-100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: direction > 0 ? "-100%" : "100%", opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.32, 0.72, 0.18, 1] }}
          style={{ display: "inline-block" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Put the animated counters back into a finished status sentence. `t` is asked
 * for the sentence with its numbers already in place, because the catalog owns
 * both the plural form and where the number sits; each one is then located in
 * the result and swapped for its `RollingCount`. Assembling the sentence from
 * fragments instead would hard-code a word order only the catalog knows.
 *
 * @param {string} text
 * @param {{ value: number, node: React.ReactElement }[]} slots In sentence order.
 * @returns {React.ReactNode[]}
 */
function withCounters(text, slots) {
  /** @type {React.ReactNode[]} */
  const out = [];
  let rest = text;
  for (const { value, node } of slots) {
    const token = String(value);
    const at = rest.indexOf(token);
    if (at === -1) continue;
    out.push(rest.slice(0, at), node);
    rest = rest.slice(at + token.length);
  }
  out.push(rest);
  return out;
}

/**
 * @param {{
 *   dirtyCount: number,
 *   collectionDirtyCount: number,
 *   firstDirtyCollectionTarget: { key: string, slug: string } | null,
 *   onGoToCollection: (target: { key: string, slug: string }) => void,
 *   isSaving: boolean,
 *   draftSyncStatus: "idle"|"saving"|"saved"|"failed",
 *   onDiscardAll: () => void,
 *   onSaveAll: () => void,
 *   previewableCount: number,
 *   isPreviewOpen: boolean,
 *   onTogglePreview: () => void,
 * }} props
 */
function StatusBar({
  dirtyCount, collectionDirtyCount, firstDirtyCollectionTarget, onGoToCollection,
  isSaving, draftSyncStatus,
  onDiscardAll, onSaveAll,
  previewableCount, isPreviewOpen, onTogglePreview,
}) {
  const t = useCmsStrings();
  const isContentDirty = dirtyCount > 0;
  const isCollectionDirty = collectionDirtyCount > 0;
  const isBothDirty = isContentDirty && isCollectionDirty;
  const isOnlyCollectionDirty = !isContentDirty && isCollectionDirty;
  const isDraftSaving = draftSyncStatus === "saving";
  // The dot only says "something is on the wire", so both count toward it. The
  // sentence has to pick one, and picking wrong is how publishing came to
  // announce itself as an autosave.
  const isBusy = isDraftSaving || isSaving;
  const isFailed  = draftSyncStatus === "failed";

  // Dirty colours never pulse (a steady tint reads as "pending" without
  // competing with the syncing pulse).
  /** @type {React.CSSProperties} */
  const dotBackground = (() => {
    if (isBothDirty) {
      return /** @type {*} */ ({
        background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT} 50%, ${COLLECTION_ACCENT} 50%, ${COLLECTION_ACCENT} 100%)`,
        boxShadow: `0 0 4px ${ACCENT}66, 0 0 4px ${COLLECTION_ACCENT}66`,
      });
    }
    if (isContentDirty) {
      return { background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` };
    }
    if (isCollectionDirty) {
      return { background: COLLECTION_ACCENT, boxShadow: `0 0 8px ${COLLECTION_ACCENT}80` };
    }
    if (isBusy) {
      return { background: STATUS_WARN, boxShadow: `0 0 6px ${STATUS_WARN}66` };
    }
    if (isFailed) {
      return { background: STATUS_DANGER, boxShadow: "none" };
    }
    return { background: TEXT_FAINT, boxShadow: "none" };
  })();
  const dotPulse = isBusy && !isContentDirty && !isCollectionDirty;

  /** @type {React.ReactNode} */
  let msg;
  if (isSaving) {
    // Wins over the draft wording when both are true: publishing is what the
    // user just asked for, and any draft write beside it is background.
    msg = <span style={statusMsgStyle}>{t("status.publishing")}</span>;
  } else if (isDraftSaving) {
    msg = <span style={statusMsgStyle}>{t("status.draftSaving")}</span>;
  } else if (isBothDirty) {
    msg = (
      <span style={statusMsgStyle}>
        {withCounters(
          t("status.unsavedSplit", { content: dirtyCount, collection: collectionDirtyCount }),
          [
            {
              value: dirtyCount,
              node: <RollingCount key="content" value={dirtyCount} style={statusMsgEmphasisStyle} />,
            },
            {
              value: collectionDirtyCount,
              node: (
                <RollingCount
                  key="collection"
                  value={collectionDirtyCount}
                  style={{ ...statusMsgEmphasisStyle, color: COLLECTION_ACCENT }}
                />
              ),
            },
          ],
        )}
      </span>
    );
  } else if (isContentDirty) {
    msg = (
      <span style={statusMsgStyle}>
        {withCounters(t("status.unsaved", { count: dirtyCount }), [
          {
            value: dirtyCount,
            node: <RollingCount key="count" value={dirtyCount} style={statusMsgEmphasisStyle} />,
          },
        ])}
      </span>
    );
  } else if (isCollectionDirty) {
    msg = (
      <span style={statusMsgStyle}>
        {withCounters(t("status.collectionDrafts", { count: collectionDirtyCount }), [
          {
            value: collectionDirtyCount,
            node: (
              <RollingCount
                key="count"
                value={collectionDirtyCount}
                style={{ ...statusMsgEmphasisStyle, color: COLLECTION_ACCENT }}
              />
            ),
          },
        ])}
      </span>
    );
  } else if (isFailed) {
    msg = <span style={statusMsgStyle}>{t("status.draftFailed")}</span>;
  } else {
    // Clean state. The header pill carries the timestamp detail, so the bar
    // stays a quiet idle line rather than repeating it.
    msg = <span style={{ ...statusMsgStyle, ...statusMsgCleanStyle }}>{t("status.clean")}</span>;
  }

  // Same guard as the header pill: FLIP-measure the action buttons only when
  // the visible button set (or the preview label swap) changes, not on every
  // drawer re-render.
  const actionsLayoutKey = [
    previewableCount > 0,
    isPreviewOpen,
    isContentDirty,
    isOnlyCollectionDirty && Boolean(firstDirtyCollectionTarget),
  ].join("|");

  // Only the coarse transitions, never the dirty count: the count moves on
  // every keystroke, and a live region tracking it would talk over the editor.
  const announcement = isSaving
    ? t("status.publishing")
    : isDraftSaving
      ? t("status.draftSaving")
      : isFailed
        ? t("status.draftFailed")
        : draftSyncStatus === "saved"
          ? t("pill.draftSaved")
          : "";

  return (
    <div style={statusBarStyle}>
      <span role="status" style={srOnlyStyle}>{announcement}</span>
      <div style={statusSignalStyle}>
        <span
          className={dotPulse ? "inscribed-status-pulse" : undefined}
          style={{ ...statusDotStyle, ...dotBackground }}
        />
        {msg}
      </div>
      <div style={statusActionsStyle}>
        <AnimatePresence mode="popLayout" initial={false}>
          {previewableCount > 0 ? (
            <motion.button
              key="preview"
              type="button"
              onClick={onTogglePreview}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label={isPreviewOpen ? t("status.closePreview") : t("status.preview")}
              title={isPreviewOpen ? t("status.closePreview") : t("status.preview")}
              aria-pressed={isPreviewOpen}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              {isPreviewOpen ? <Pencil size={13} /> : <Eye size={13} />}
            </motion.button>
          ) : null}
          {isContentDirty ? (
            <motion.button
              key="discard"
              type="button"
              onClick={onDiscardAll}
              disabled={isSaving}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label={t("drawer.discardAll")}
              title={t("drawer.discardAll")}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              <Undo2 size={13} />
            </motion.button>
          ) : null}
          {isContentDirty ? (
            <motion.button
              key="save"
              type="button"
              onClick={onSaveAll}
              disabled={isSaving}
              className="inscribed-btn-primary"
              style={btnPrimaryStyle}
              aria-label={t("drawer.saveAll")}
              title={t("drawer.saveAll")}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              <Check size={13} />
              <span>{t("status.save")}</span>
            </motion.button>
          ) : null}
          {!isContentDirty && isOnlyCollectionDirty && firstDirtyCollectionTarget ? (
            <motion.button
              key="open-collection"
              type="button"
              onClick={() => onGoToCollection(firstDirtyCollectionTarget)}
              className="inscribed-btn-collection-solid"
              style={btnPrimaryStyle}
              aria-label={t("drawer.openRecord", firstDirtyCollectionTarget)}
              title={t("drawer.openRecord", firstDirtyCollectionTarget)}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              <Pencil size={13} />
              <span>{t("drawer.open")}</span>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer (user info + sign out)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   userInfo: { name: string|null, email: string|null, image: string|null },
 *   onSignOut: (() => void) | null,
 * }} props
 */
function PanelFooter({ userInfo, onSignOut }) {
  const t = useCmsStrings();
  const initials = (userInfo.name ?? userInfo.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <footer style={footerStyle}>
      <div style={avatarStyle} aria-hidden="true">
        {userInfo.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userInfo.image} alt="" style={avatarImgStyle} />
        ) : (
          <span style={avatarInitialsStyle}>{initials}</span>
        )}
      </div>
      <div style={userMetaStyle}>
        <div style={userNameStyle}>{userInfo.name ?? t("drawer.anonymous")}</div>
        {userInfo.email ? (
          <div style={userEmailStyle} title={userInfo.email}>
            {userInfo.email}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSignOut ?? undefined}
        disabled={!onSignOut}
        className="inscribed-logout"
        style={signOutButtonStyle}
        aria-label={t("drawer.signOut")}
        title={t("drawer.signOut")}
      >
        <LogOut size={14} />
      </button>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `/about/team` → `[{label:"about", href:"/about"}, {label:"team",
 * href:"/about/team"}]`; `/` → `[]`. The `~` root is rendered by the header
 * itself, so it isn't a segment here. Each href is cumulative, which is what
 * makes an ancestor clickable.
 *
 * @param {string} pathname
 * @returns {{ label: string, href: string }[]}
 */
function pathnameToSegments(pathname) {
  const clean = pathname.replace(/^\//, "").replace(/\/$/, "");
  if (!clean) return [];
  /** @type {{ label: string, href: string }[]} */
  const out = [];
  let href = "";
  for (const label of clean.split("/")) {
    href += `/${label}`;
    out.push({ label, href });
  }
  return out;
}