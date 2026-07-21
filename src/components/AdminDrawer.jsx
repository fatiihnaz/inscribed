"use client";

/**
 * @file Slide-in admin panel for inline editing. Mounted only for admins
 * (gated by `CmsProvider`); always in the DOM but translated off-screen when
 * closed, with a chevron handle at x=0 to reopen.
 *
 * Layout (top to bottom):
 *   - Header:   breadcrumb + page title + mode chip.
 *   - TabBar:   Sayfa / Genel + one per Collection binding, each with a count
 *               badge and (when its lane is dirty) a sage dot.
 *   - Toolbar:  block-list search (blockPath/blockType), Page/Global tabs only.
 *   - Body:     per-tab block list, or `<AdminCollectionRegionPanel>`.
 *   - StatusBar: bottom lane: idle / saving / dirty (count + Geri al / Kaydet).
 *   - Footer:   user info + sign-out.
 *
 * Visual tokens and styles live in `admin-drawer-styles.js`; this file is
 * layout + state only.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft, ChevronDown, ChevronLeft, ChevronRight,
  Check, Undo2, LogOut, Search, Eye, Pencil,
} from "./icons.jsx";

import { useCmsContext } from "../lib/context.js";
import { useCollectionContext } from "../lib/collection-context.js";
import { useStoreSelector } from "../lib/store.js";
import { useCmsSave } from "../hooks/use-cms-save.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
import { CmsApiError } from "../lib/errors.js";
import { stableStringify } from "../lib/stable-stringify.js";

import { BlockCard, resetBlock } from "./AdminBlockCard.jsx";
import { AdminCollectionRegionPanel } from "./AdminCollectionRegionPanel.jsx";
import { AdminChangesPanel } from "./AdminChangesPanel.jsx";

import {
  PANEL_WIDTH,
  PANEL_TRANSITION,
  ACCENT,
  COLLECTION_ACCENT,
  TEXT,
  TEXT_MID,
  TEXT_MUTED,
  TEXT_FAINT,
  HAIRLINE,
  SURFACE_1,
  SURFACE_2,
  FONT_SANS,
  FONT_MONO,
  STATUS_OK,
  STATUS_WARN,
  STATUS_DANGER,
  panelStyle,
  paneContainerStyle,
  paneStyle,
  headerStyle,
  breadcrumbStyle,
  breadcrumbHomeStyle,
  breadcrumbItemWrapStyle,
  breadcrumbSepStyle,
  breadcrumbCurrentStyle,
  breadcrumbInactiveStyle,
  titleBarStyle,
  pageTitleStyle,
  tabBarStyle,
  tabBarScrollStyle,
  tabBarChevronStyle,
  tabButtonStyle,
  tabButtonActiveStyle,
  tabLabelStyle,
  tabCountBadgeStyle,
  tabCountBadgeActiveStyle,
  tabDirtyDotStyle,
  toolbarStyle,
  searchWrapStyle,
  searchInputStyle,
  searchClearStyle,
  groupCardStyle,
  groupHeaderStyle,
  groupNameStyle,
  groupCountStyle,
  groupDirtyDotStyle,
  groupBodyStyle,
  groupRailStyle,
  groupDividerStyle,
  listStyle,
  emptyStateStyle,
  statusBarStyle,
  statusSignalStyle,
  statusDotStyle,
  statusMsgStyle,
  statusMsgCleanStyle,
  statusMsgEmphasisStyle,
  statusActionsStyle,
  btnPrimaryStyle,
  btnGhostStyle,
  handleButtonStyle,
  handleIconStyle,
  footerStyle,
  avatarStyle,
  avatarImgStyle,
  avatarInitialsStyle,
  userMetaStyle,
  userNameStyle,
  userEmailStyle,
  signOutButtonStyle,
  errorStyle,
  conflictStyle,
  panelCss,
} from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse } from "../lib/schemas.js"
 */

export function AdminDrawer() {
  const {
    activeBlock,
    setActiveBlock,
    blocks,
    contentDraftsStore,
    setDraft,
    clearDraft,
    isDrawerOpen,
    setDrawerOpen,
    itemSchemas,
    editorVisibility,
    userInfo,
    onSignOut,
    draftSyncStatus,
  } = useCmsContext();
  // Collection state lives in its own provider, which CmsProvider always wraps
  // the drawer in, so the throwing reader is safe here.
  const {
    activeCollectionItem,
    setActiveCollectionItem,
    collectionBindings,
    collectionStore,
  } = useCollectionContext();
  // The drawer aggregates the whole draft/collection state, so it subscribes to
  // full slices. As a single admin surface, re-rendering on every write is fine.
  const collectionListCache = useStoreSelector(collectionStore, (s) => s.listCache);
  const collectionItemCache = useStoreSelector(collectionStore, (s) => s.itemCache);
  const collectionDrafts = useStoreSelector(collectionStore, (s) => s.drafts);
  const drafts = useStoreSelector(contentDraftsStore, (m) => m);
  const myCollections = useMyCollections().collections;
  const {
    dirtyCount, isSaving, error,
    save: onSaveAll, discard: onDiscardAll,
  } = useCmsSave();
  const pathname = usePathname() ?? "/";

  // Warm the Tiptap chunk in the background once the admin surface mounts, so
  // the first RichText edit (drawer card or in-place) doesn't stall ~1-2s on the
  // lazy import. Admin-only path already; idle so it never competes with paint.
  useEffect(() => {
    const prefetch = () => { import("./editors/RichTextEditor.jsx").catch(() => {}); };
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    if (ric) {
      const id = ric(prefetch, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(prefetch, 800);
    return () => clearTimeout(t);
  }, []);

  // Search filter (path + type), Page/Global tabs only; Collection lanes
  // filter inside their own panel.
  const [search, setSearch] = useState("");

  // Split blocks into page/global lists and compute a per-block dirty flag here
  // so the tab bar's dot doesn't re-derive it per card. CollectionItem bindings
  // are synthesised into the page list as virtual Collection blocks.
  const { pageBlockList, globalBlockList, dirtyByPath } = useMemo(() => {
    /** @type {BlockResponse[]} */
    const pages = [];
    /** @type {BlockResponse[]} */
    const globals = [];
    /** @type {Map<string, boolean>} */
    const dirty = new Map();

    for (const block of blocks.values()) {
      // `visible={false}` regions register as "hidden": drop them entirely.
      if (editorVisibility.get(block.blockPath) === "hidden") continue;

      const slug = block._slug ?? pathname;
      (slug === pathname ? pages : globals).push(block);

      const local = drafts.get(block.blockPath);
      const isDirty = local !== undefined
        ? stableStringify(local) !== stableStringify(block.value)
        : block.draftValue != null;
      dirty.set(block.blockPath, isDirty);
    }
    pages.sort((a, b) => a.sortOrder - b.sortOrder);
    globals.sort((a, b) => a.sortOrder - b.sortOrder);

    let nextSort = pages.length > 0 ? pages[pages.length - 1].sortOrder + 1 : 1;
    for (const [blockPath, binding] of collectionBindings) {
      if (!binding.slug) continue;
      pages.push(/** @type {BlockResponse} */ ({
        blockPath,
        blockType: "Collection",
        value: binding,
        version: 0,
        sortOrder: nextSort++,
        _slug: pathname,
      }));
    }

    return { pageBlockList: pages, globalBlockList: globals, dirtyByPath: dirty };
  }, [blocks, pathname, collectionBindings, drafts, editorVisibility]);

  // Tab list: always "page"/"global", plus one per `<CollectionRegion>` binding
  // on this page the user can access (per /me).
  const regionTabs = useMemo(() => {
    /** @type {Set<string>} */
    const pageRegions = new Set();
    for (const [, binding] of collectionBindings) {
      if (binding.slug) continue;
      pageRegions.add(binding.collection);
    }
    /** @type {{ id: string, label: string, count: number, key: string }[]} */
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
      out.push({
        id: `collection:${my.collectionKey}`,
        label: my.collectionKey,
        count: total,
        key: my.collectionKey,
      });
    }
    return out;
  }, [collectionBindings, myCollections, collectionListCache]);

  // Per-key dirty flag for the tab dot, unioning the live overlay map and
  // cached items carrying server `draftData`. The cache pass is needed because
  // the overlay clears once autosave lands, which would otherwise drop the dot.
  const collectionDirtyByKey = useMemo(() => {
    /** @type {Set<string>} */
    const set = new Set();
    for (const draftKey of collectionDrafts.keys()) {
      const i = draftKey.indexOf(":");
      if (i > 0) set.add(draftKey.slice(0, i));
    }
    for (const [cacheKey, entry] of collectionItemCache) {
      if (!entry.item || entry.item.draftData == null) continue;
      const i = cacheKey.indexOf(":");
      if (i > 0) set.add(cacheKey.slice(0, i));
    }
    return set;
  }, [collectionDrafts, collectionItemCache]);

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
    return n;
  }, [pageBlockList, globalBlockList, dirtyByPath]);

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
      { id: "page", label: "Sayfa", count: pageBlockList.length, dirty: pageDirty },
      ...(globalBlockList.length > 0
        ? [{ id: "global", label: "Genel", count: globalBlockList.length, dirty: globalDirty }]
        : []),
      ...regionTabs.map((t) => ({
        ...t,
        dirty: collectionDirtyByKey.has(t.key),
      })),
    ],
    [pageBlockList.length, globalBlockList.length, regionTabs, pageDirty, globalDirty, collectionDirtyByKey],
  );

  const [activeTab, setActiveTabState] = useState(/** @type {string} */ ("page"));
  // Preview overlay: renders `AdminChangesPanel` in the body slot instead of the
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

  // If the active tab disappears (e.g. navigating off a page with a Region
  // binding), fall back to "page". Raw setter so a routing event doesn't also
  // close an open preview.
  useEffect(() => {
    if (allTabs.some((t) => t.id === activeTab)) return;
    setActiveTabState("page");
  }, [allTabs, activeTab]);

  // Failsafe for the "Aç" signal: the card normally consumes and clears it on
  // mount, but if the target slug sits past a paginated window the card never
  // mounts. Drop the signal when the user leaves the target tab so it can't
  // fire stale on a later "Load more".
  useEffect(() => {
    if (!activeCollectionItem) return;
    if (activeTab === `collection:${activeCollectionItem.key}`) return;
    setActiveCollectionItem(null);
  }, [activeTab, activeCollectionItem, setActiveCollectionItem]);

  // Per-group collapse state. Storing the *closed* set means new groups from
  // discovery default to expanded.
  const [closedGroups, setClosedGroups] = useState(/** @type {Set<string>} */ (new Set()));

  const toggleGroup = (group) => {
    const closing = !closedGroups.has(group);
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
    if (closing && activeBlock && blockPathPrefix(activeBlock) === group) {
      setActiveBlock(null);
    }
  };

  // When an EditableRegion is clicked, open the panel and switch to its tab so
  // the matching card scrolls into view instead of hiding behind another tab.
  useEffect(() => {
    if (!activeBlock) return;
    if (!isDrawerOpen) setDrawerOpen(true);
    const block = blocks.get(activeBlock);
    if (!block) return;
    const slug = block._slug ?? pathname;
    const tab = slug === pathname ? "page" : "global";
    setActiveTab(tab);
    const prefix = blockPathPrefix(block.blockPath);
    if (prefix == null) return;
    setClosedGroups((prev) => {
      if (!prev.has(prefix)) return prev;
      const next = new Set(prev);
      next.delete(prefix);
      return next;
    });
  }, [activeBlock, blocks, pathname, isDrawerOpen, setDrawerOpen]);

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
    const t = setTimeout(() => setPublishedFlash(false), 2400);
    return () => clearTimeout(t);
  }, [publishedFlash]);
  // A new autosave or returning to dirty invalidates the "Veri kaydedildi"
  // flash, since the data no longer matches the just-published state.
  useEffect(() => {
    if (draftSyncStatus === "saving" || dirtyCount > 0) setPublishedFlash(false);
  }, [draftSyncStatus, dirtyCount]);

  const isConflict = error instanceof CmsApiError && error.isConflict;
  const isForbidden = error instanceof CmsApiError && error.isForbidden;
  const breadcrumbs = pathnameToBreadcrumbs(pathname);

  const matchSearch = (block) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return block.blockPath.toLowerCase().includes(q)
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

  return (
    <>
      <style>{panelCss}</style>
      <motion.aside
        initial={false}
        animate={{ x: isDrawerOpen ? 0 : -PANEL_WIDTH }}
        transition={PANEL_TRANSITION}
        style={panelStyle}
        aria-hidden={!isDrawerOpen}
      >
        <div style={paneContainerStyle}>
          <PanelHeader
            breadcrumbs={breadcrumbs}
            dirty={dirtyCount > 0}
            draftSyncStatus={draftSyncStatus}
            isSaving={isSaving}
            lastSavedAt={lastSavedAt}
            publishedFlash={publishedFlash}
          />

          {isPreviewOpen ? (
            <PreviewHeader
              count={previewableCount + collectionDirtyTotal}
              onBack={() => setPreviewOpen(false)}
            />
          ) : (
            <TabBar
              tabs={allTabs}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          )}

          {isPreviewOpen ? (
            <AdminChangesPanel
              blockList={[...pageBlockList, ...globalBlockList]}
              drafts={drafts}
              dirtyByPath={dirtyByPath}
              itemSchemas={itemSchemas}
              collectionDirtyCounts={collectionDirtyCounts}
              onGoToBlock={(block) => {
                setPreviewOpen(false);
                const scope = (block._slug ?? pathname) === pathname ? "page" : "global";
                setActiveTabState(scope);
                setActiveBlock(block.blockPath);
              }}
              onGoToCollection={(collectionKey) => {
                setPreviewOpen(false);
                setActiveTabState(`collection:${collectionKey}`);
              }}
            />
          ) : (activeTab === "page" || activeTab === "global") ? (
            <>
              <Toolbar value={search} onChange={setSearch} />
              <GroupedBlockList
                blockList={activeTab === "page" ? filteredPage : filteredGlobal}
                drafts={drafts}
                setDraft={setDraft}
                clearDraft={clearDraft}
                activeBlockPath={activeBlock}
                onFocus={setActiveBlock}
                itemSchemas={itemSchemas}
                editorVisibility={editorVisibility}
                closedGroups={closedGroups}
                onToggleGroup={toggleGroup}
                dirtyByPath={dirtyByPath}
                emptyHint={
                  search
                    ? `"${search}" araması için sonuç yok.`
                    : activeTab === "page"
                      ? "Bu sayfada düzenlenebilir blok yok. Yeni bloklar eklemek için manifest sync'ini çalıştır."
                      : "Henüz scope=\"global\" işaretli blok yok."
                }
              />
            </>
          ) : activeTab.startsWith("collection:") ? (
            // Keyed so switching collection tabs resets the panel's detail-pane
            // state instead of carrying an open pane across collections.
            <AdminCollectionRegionPanel
              key={activeTab}
              collectionKey={activeTab.slice("collection:".length)}
            />
          ) : null}

          {error ? (
            <div style={isConflict ? conflictStyle : errorStyle}>
              {isConflict
                ? "Bir blok başka biri tarafından güncellendi. En son sürüm yüklendi — kontrol edip tekrar dene."
                : isForbidden
                  ? "Yetkiniz yok. Bu içeriği düzenleme izniniz bulunmuyor."
                  : (error.message ?? "Kaydedilemedi")}
            </div>
          ) : null}

          <StatusBar
            dirtyCount={dirtyCount}
            collectionDirtyCount={collectionDirtyTotal}
            firstDirtyCollectionTarget={firstDirtyCollectionTarget}
            onGoToCollection={(target) => {
              setActiveTabState(`collection:${target.key}`);
              // Signal the matching RegionItemCard to auto-expand once its tab
              // body mounts (it reads `activeCollectionItem` on first paint).
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

          {userInfo ? (
            <PanelFooter userInfo={userInfo} onSignOut={onSignOut} />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          className="inscribed-handle"
          style={handleButtonStyle}
          aria-label={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
          aria-expanded={isDrawerOpen}
          title={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
        >
          <span
            className="inscribed-handle-slide"
            style={{
              ...handleIconStyle,
              "--slide-x": isDrawerOpen ? "-3px" : "3px",
            }}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   breadcrumbs: { label: string }[],
 *   dirty: boolean,
 *   draftSyncStatus: "idle"|"saving"|"saved"|"failed",
 *   isSaving: boolean,
 *   lastSavedAt: string | null,
 *   publishedFlash: boolean,
 * }} props
 */
function PanelHeader({ breadcrumbs, dirty, draftSyncStatus, isSaving, lastSavedAt, publishedFlash }) {
  const pageLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? "";

  return (
    <header style={headerStyle}>
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        <span style={breadcrumbHomeStyle}>~</span>
        {breadcrumbs.slice(1).map((crumb, i, arr) => (
          <span key={i} style={breadcrumbItemWrapStyle}>
            <span style={breadcrumbSepStyle}>/</span>
            <span
              style={i === arr.length - 1 ? breadcrumbCurrentStyle : breadcrumbInactiveStyle}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div style={titleBarStyle}>
        <h2 style={pageTitleStyle}>{pageLabel}</h2>
        <HeaderStatusPill
          dirty={dirty}
          draftSyncStatus={draftSyncStatus}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
          publishedFlash={publishedFlash}
        />
      </div>
    </header>
  );
}

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
  const isSyncing = draftSyncStatus === "saving" || isSaving;
  const isFailed = draftSyncStatus === "failed";

  /** @type {{ state: string, bg: string, glow: string, pulse: boolean, label: React.ReactNode, title: string }} */
  let view;

  if (isFailed) {
    view = {
      state: "failed",
      bg: STATUS_DANGER,
      glow: "none",
      pulse: false,
      label: "Kaydedilemedi",
      title: "Taslak kaydedilemedi",
    };
  } else if (publishedFlash) {
    // Post-publish pulse: drafts are now live data, so "Veri kaydedildi" shows
    // for a couple of seconds before falling back to the idle dot.
    view = {
      state: "published",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: "Veri kaydedildi",
      title: "Tüm değişiklikler yayınlandı",
    };
  } else if (lastSavedAt) {
    // Hold the label steady during re-saves; only the dot pulses and recolours.
    // The timestamp slides when the minute changes (same value, same key, no anim).
    view = {
      state: "saved",
      bg: isSyncing ? STATUS_WARN : STATUS_OK,
      glow: isSyncing ? `0 0 5px ${STATUS_WARN}66` : `0 0 5px ${STATUS_OK}66`,
      pulse: isSyncing,
      label: (
        <>
          Taslak kayıtlı
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
      title: `Taslak en son ${lastSavedAt}'de kaydedildi`,
    };
  } else if (isSyncing) {
    // First save ever, no prior timestamp to anchor to.
    view = {
      state: "saving",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: "Kaydediliyor…",
      title: "Taslak şu anda kaydediliyor",
    };
  } else if (dirty) {
    view = {
      state: "dirty",
      bg: ACCENT,
      glow: `0 0 5px ${ACCENT}66`,
      pulse: false,
      label: "Düzenleniyor",
      title: "Kaydedilmemiş değişiklikler var",
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
  fontSize: 12,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
});

const headerPillTimeStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: TEXT_FAINT,
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   tabs: { id: string, label: string, count: number, dirty?: boolean }[],
 *   activeTab: string,
 *   onChange: (tab: string) => void,
 * }} props
 */
function TabBar({ tabs, activeTab, onChange }) {
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
      setIndicator({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        color: activeTab.startsWith("collection:") ? COLLECTION_ACCENT : ACCENT,
      });
    }
    requestAnimationFrame(measure);
  }, [activeTab, tabs, measure]);

  const nudge = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div style={tabBarStyle}>
      {overflow.left ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="inscribed-tabbar-chevron"
          style={tabBarChevronStyle}
          aria-label="Önceki sekmeler"
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
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            count={tab.count}
            dirty={Boolean(tab.dirty)}
            active={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
          />
        ))}
        {indicator ? (
          <span
            aria-hidden="true"
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
          aria-label="Sonraki sekmeler"
        >
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   id: string, label: string, count: number,
 *   active: boolean, dirty: boolean, onClick: () => void,
 * }} props
 */
function TabButton({ id, label, count, active, dirty, onClick }) {
  const isCollection = id.startsWith("collection:");
  const activeStyle = active
    ? {
        ...tabButtonStyle,
        ...tabButtonActiveStyle,
        ...(isCollection ? { color: COLLECTION_ACCENT } : null),
      }
    : tabButtonStyle;
  return (
    <button
      type="button"
      role="tab"
      data-tab-id={id}
      aria-selected={active}
      onClick={onClick}
      className="inscribed-tab"
      style={activeStyle}
    >
      <span style={tabLabelStyle}>{label}</span>
      <span
        style={active ? { ...tabCountBadgeStyle, ...tabCountBadgeActiveStyle } : tabCountBadgeStyle}
      >
        {count}
      </span>
      {dirty ? (
        <span
          style={isCollection
            ? { ...tabDirtyDotStyle, background: COLLECTION_ACCENT, boxShadow: `0 0 6px ${COLLECTION_ACCENT}80` }
            : tabDirtyDotStyle}
          aria-label="kaydedilmemiş değişiklik var"
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
  return (
    <div style={toolbarStyle}>
      <div className="inscribed-search" style={searchWrapStyle}>
        <Search size={13} color={TEXT_FAINT} />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Blok ara (yol veya tip)"
          aria-label="Blok ara"
          style={searchInputStyle}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inscribed-search-clear"
            style={searchClearStyle}
            aria-label="Temizle"
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
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 *   itemSchemas: Map<string, import("../lib/schemas.js").ItemSchema>,
 *   editorVisibility: Map<string, "hidden"|"readonly">,
 *   closedGroups: Set<string>,
 *   onToggleGroup: (group: string) => void,
 *   dirtyByPath: Map<string, boolean>,
 *   emptyHint: string,
 * }} props
 */
function GroupedBlockList({
  blockList, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, editorVisibility, closedGroups, onToggleGroup, dirtyByPath, emptyHint,
}) {
  const chunks = useMemo(() => chunkBlocksByPrefix(blockList), [blockList]);

  return (
    <section style={paneStyle}>
      {blockList.length === 0 ? (
        <div style={emptyStateStyle}>{emptyHint}</div>
      ) : (
        <ul style={listStyle} data-cms-list>
          {chunks.map((chunk, i) => {
            const row = chunk.type === "single" ? (
              <li key={`s:${chunk.block.blockPath}`} style={{ listStyle: "none" }}>
                <BlockCard
                  block={chunk.block}
                  draft={drafts.get(chunk.block.blockPath)}
                  hasDraft={drafts.has(chunk.block.blockPath)}
                  isActive={activeBlockPath === chunk.block.blockPath}
                  onChange={(v) => setDraft(chunk.block.blockPath, v)}
                  onReset={() => resetBlock(chunk.block, setDraft, clearDraft)}
                  onFocus={() => onFocus(chunk.block.blockPath)}
                  itemSchema={itemSchemas.get(chunk.block.blockPath) ?? null}
                  readOnly={editorVisibility.get(chunk.block.blockPath) === "readonly"}
                />
              </li>
            ) : (
              <li key={`g:${chunk.name}`} style={{ listStyle: "none" }}>
                <GroupCard
                  groupName={chunk.name}
                  blocks={chunk.blocks}
                  drafts={drafts}
                  setDraft={setDraft}
                  clearDraft={clearDraft}
                  activeBlockPath={activeBlockPath}
                  onFocus={onFocus}
                  itemSchemas={itemSchemas}
                  editorVisibility={editorVisibility}
                  dirty={chunk.blocks.some((b) => dirtyByPath.get(b.blockPath))}
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
}

/**
 * @param {{
 *   groupName: string,
 *   blocks: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 *   itemSchemas: Map<string, import("../lib/schemas.js").ItemSchema>,
 *   editorVisibility: Map<string, "hidden"|"readonly">,
 *   dirty: boolean,
 *   isOpen: boolean,
 *   onToggle: () => void,
 * }} props
 */
function GroupCard({
  groupName, blocks, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, editorVisibility, dirty, isOpen, onToggle,
}) {
  return (
    <div style={groupCardStyle}>
      <button type="button" className="inscribed-group-header" style={groupHeaderStyle} onClick={onToggle} aria-expanded={isOpen}>
        <span style={groupNameStyle}>{groupName}</span>
        <span style={groupCountStyle}>
          {blocks.length}
          {dirty ? <span style={groupDirtyDotStyle} aria-label="kaydedilmemiş değişiklik var" /> : null}
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
                  displayPath={stripGroupPrefix(block.blockPath, groupName)}
                  draft={drafts.get(block.blockPath)}
                  hasDraft={drafts.has(block.blockPath)}
                  isActive={activeBlockPath === block.blockPath}
                  onChange={(v) => setDraft(block.blockPath, v)}
                  onReset={() => resetBlock(block, setDraft, clearDraft)}
                  onFocus={() => onFocus(block.blockPath)}
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
 * Group prefix: the slice before the first dot, or null for a dotless path so
 * the caller renders it flat instead of as a single-item group.
 *
 * @param {string} blockPath
 * @returns {string | null}
 */
function blockPathPrefix(blockPath) {
  const dot = blockPath.indexOf(".");
  return dot === -1 ? null : blockPath.slice(0, dot);
}

/**
 * Drop the `${group}.` prefix from a grouped child's path for display, so a
 * child of the "hero" group reads as `cover`, not `hero.cover`. The full path
 * stays in the row's title. Falls back to the raw path if the prefix doesn't
 * match (defensive; grouped children always carry it).
 *
 * @param {string} blockPath
 * @param {string} groupName
 */
function stripGroupPrefix(blockPath, groupName) {
  const p = `${groupName}.`;
  return blockPath.startsWith(p) ? blockPath.slice(p.length) : blockPath;
}

/**
 * @typedef {{ type: "single", block: BlockResponse }
 *         | { type: "group", name: string, blocks: BlockResponse[] }} BlockChunk
 */

/**
 * @param {BlockResponse[]} blocks
 * @returns {BlockChunk[]}
 */
function chunkBlocksByPrefix(blocks) {
  /** @type {BlockChunk[]} */
  const chunks = [];
  /** @type {Map<string, number>} */
  const groupChunkIndex = new Map();

  for (const block of blocks) {
    const prefix = blockPathPrefix(block.blockPath);
    if (prefix == null) {
      chunks.push({ type: "single", block });
      continue;
    }
    const existing = groupChunkIndex.get(prefix);
    if (existing != null) {
      const chunk = chunks[existing];
      if (chunk.type === "group") chunk.blocks.push(block);
      continue;
    }
    groupChunkIndex.set(prefix, chunks.length);
    chunks.push({ type: "group", name: prefix, blocks: [block] });
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
  return (
    <div style={previewHeaderStyle}>
      <button
        type="button"
        onClick={onBack}
        className="inscribed-preview-back"
        style={previewBackStyle}
        aria-label="Düzenlemeye dön"
      >
        <ChevronLeft size={12} />
        <span>Düzenle</span>
      </button>
      <div style={previewTitleStyle}>
        <span>Değişiklikler</span>
        <span style={previewCountStyle}>{count}</span>
      </div>
    </div>
  );
}

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
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  fontFamily: "inherit",
});

const previewTitleStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: TEXT_MUTED,
  font: `500 10px/1 ${FONT_MONO}`,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
});

const previewCountStyle = /** @type {React.CSSProperties} */ ({
  font: `500 10px/1 ${FONT_MONO}`,
  padding: "3px 6px",
  borderRadius: 99,
  background: SURFACE_2,
  color: TEXT_MID,
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
  const isContentDirty = dirtyCount > 0;
  const isCollectionDirty = collectionDirtyCount > 0;
  const isBothDirty = isContentDirty && isCollectionDirty;
  const isOnlyCollectionDirty = !isContentDirty && isCollectionDirty;
  const isSyncing = draftSyncStatus === "saving" || isSaving;
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
    if (isSyncing) {
      return { background: STATUS_WARN, boxShadow: `0 0 6px ${STATUS_WARN}66` };
    }
    if (isFailed) {
      return { background: STATUS_DANGER, boxShadow: "none" };
    }
    return { background: TEXT_FAINT, boxShadow: "none" };
  })();
  const dotPulse = isSyncing && !isContentDirty && !isCollectionDirty;

  /** @type {React.ReactNode} */
  let msg;
  if (isSyncing) {
    msg = <span style={statusMsgStyle}>Taslak kaydediliyor…</span>;
  } else if (isBothDirty) {
    msg = (
      <span style={statusMsgStyle}>
        <RollingCount value={dirtyCount} style={statusMsgEmphasisStyle} />
        <span style={{ color: TEXT_FAINT, margin: "0 1px" }}>/</span>
        <RollingCount value={collectionDirtyCount} style={{ ...statusMsgEmphasisStyle, color: COLLECTION_ACCENT }} />
        {" "}kaydedilmemiş değişiklik
      </span>
    );
  } else if (isContentDirty) {
    msg = (
      <span style={statusMsgStyle}>
        <RollingCount value={dirtyCount} style={statusMsgEmphasisStyle} /> kaydedilmemiş değişiklik
      </span>
    );
  } else if (isCollectionDirty) {
    msg = (
      <span style={statusMsgStyle}>
        <RollingCount value={collectionDirtyCount} style={{ ...statusMsgEmphasisStyle, color: COLLECTION_ACCENT }} />
        {" "}koleksiyon taslağı
      </span>
    );
  } else if (isFailed) {
    msg = <span style={statusMsgStyle}>Taslak kaydedilemedi</span>;
  } else {
    // Clean state. The header pill carries the timestamp detail, so the bar
    // stays a quiet idle line rather than repeating it.
    msg = <span style={{ ...statusMsgStyle, ...statusMsgCleanStyle }}>Değişiklik yok</span>;
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

  return (
    <div style={statusBarStyle}>
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
              aria-label={isPreviewOpen ? "Düzenlemeye dön" : "Değişiklikleri önizle"}
              title={isPreviewOpen ? "Düzenlemeye dön" : "Değişiklikleri önizle"}
              aria-pressed={isPreviewOpen}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              {isPreviewOpen ? <Pencil size={13} /> : <Eye size={13} />}
              <span>{isPreviewOpen ? "Düzenle" : "Önizle"}</span>
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
              aria-label="Tüm değişiklikleri iptal et"
              title="Tüm değişiklikleri iptal et"
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
              aria-label="Tümünü kaydet"
              title="Tümünü kaydet"
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              <Check size={13} />
              <span>Kaydet</span>
            </motion.button>
          ) : null}
          {!isContentDirty && isOnlyCollectionDirty && firstDirtyCollectionTarget ? (
            <motion.button
              key="open-collection"
              type="button"
              onClick={() => onGoToCollection(firstDirtyCollectionTarget)}
              className="inscribed-btn-collection-solid"
              style={btnPrimaryStyle}
              aria-label={`${firstDirtyCollectionTarget.key} / ${firstDirtyCollectionTarget.slug} kaydını aç`}
              title={`${firstDirtyCollectionTarget.key} / ${firstDirtyCollectionTarget.slug} kaydını aç`}
              {...statusActionMotion}
              layoutDependency={actionsLayoutKey}
            >
              <Pencil size={13} />
              <span>Aç</span>
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
        <div style={userNameStyle}>{userInfo.name ?? "Anonim"}</div>
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
        aria-label="Çıkış yap"
        title="Çıkış yap"
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
 * `/about/team` → `[{label:"Anasayfa"}, {label:"about"}, {label:"team"}]`.
 * `/` → `[{label:"Anasayfa"}]`. Slug segments stay lowercase mono so the
 * mono breadcrumb reads like a filesystem path.
 *
 * @param {string} pathname
 */
function pathnameToBreadcrumbs(pathname) {
  if (pathname === "/") return [{ label: "Anasayfa" }];
  const segments = pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  const crumbs = [{ label: "Anasayfa" }];
  for (const seg of segments) crumbs.push({ label: seg });
  return crumbs;
}