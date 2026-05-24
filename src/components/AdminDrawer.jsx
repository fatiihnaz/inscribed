"use client";

/**
 * @file Slide-in admin panel for inline editing.
 *
 * Mounted only when `isAdmin` is true (gated by `CmsProvider`). The panel
 * always lives in the DOM but is translated off-screen left when closed; a
 * chevron handle attached to its right edge stays visible at x=0 so admins
 * can re-open it. The handle slides with the panel - it's part of the same
 * `motion.aside`, not a separate fixed element.
 *
 * Layout (top to bottom):
 *   - Header:  small mono breadcrumb + page title + draft/published status pill
 *   - Body:    every block on the page rendered as an inline-editable card -
 *              header (block path + type chip) + the type-specific editor
 *              wired directly to a per-path draft. EditableRegion clicks just
 *              scroll/highlight the matching card; there is no separate
 *              editor view.
 *   - Footer:  global dirty banner with discard-all / save-all (single
 *              atomic `savePage` call), then user info + sign-out.
 *
 * Visual tokens, style objects, and the panel CSS string live in
 * `admin-drawer-styles.js`. Anything cosmetic should land there - this file
 * is layout + state only.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronDown, Check, Undo2, LogOut } from "lucide-react";

import { useCmsContext } from "../lib/context.js";
import { useCmsSave } from "../hooks/use-cms-save.js";
import { CmsApiError } from "../lib/api-client.js";

import { BlockCard, resetBlock } from "./AdminBlockCard.jsx";

import {
  PANEL_WIDTH,
  PANEL_TRANSITION,
  ACCENT,
  TEXT_MUTED,
  STATUS_SAVED,
  STATUS_FAILED,
  panelStyle,
  paneContainerStyle,
  paneStyle,
  headerStyle,
  breadcrumbStyle,
  breadcrumbItemWrapStyle,
  breadcrumbCurrentStyle,
  breadcrumbInactiveStyle,
  breadcrumbSepStyle,
  titleBarStyle,
  pageTitleStyle,
  statusPillStyle,
  statusDotStyle,
  statusLabelStyle,
  tabBarStyle,
  tabButtonStyle,
  tabButtonActiveStyle,
  tabCountBadgeStyle,
  groupCardStyle,
  groupHeaderStyle,
  groupNameStyle,
  groupCountStyle,
  groupBodyStyle,
  listStyle,
  emptyStateStyle,
  panelFooterStyle,
  dirtyInlineStyle,
  footerActionsStyle,
  iconActionStyle,
  iconActionPrimaryStyle,
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
    drafts,
    setDraft,
    clearDraft,
    clearDrafts,
    isDrawerOpen,
    setDrawerOpen,
    itemSchemas,
    collectionBindings,
    userInfo,
    onSignOut,
    draftSyncStatus,
  } = useCmsContext();
  const {
    dirtyCount, isSaving, error,
    save: onSaveAll, discard: onDiscardAll,
  } = useCmsSave();
  const pathname = usePathname() ?? "/";

  // Split the blocks map into page-scoped and globally-scoped lists. Each
  // group keeps its own sortOrder ordering; page comes first, global
  // (header/footer/site-wide) is shown in a separate section so it's
  // obvious which block lives where. Blocks without `_slug` are treated
  // as page-scoped (legacy fetches that haven't been re-fetched yet).
  //
  // CollectionItem bindings (registered at runtime by `<CollectionItem>`)
  // are synthesised into the page list as Collection-typed blocks so
  // they flow through the same BlockCard pipeline. Region bindings
  // (no slug) are skipped here - they'll feed Commit 2's per-collection
  // drawer tabs instead.
  const { pageBlockList, globalBlockList } = useMemo(() => {
    /** @type {BlockResponse[]} */
    const pages = [];
    /** @type {BlockResponse[]} */
    const globals = [];
    for (const block of blocks.values()) {
      const slug = block._slug ?? pathname;
      if (slug === pathname) pages.push(block);
      else globals.push(block);
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

    return { pageBlockList: pages, globalBlockList: globals };
  }, [blocks, pathname, collectionBindings]);

  // Top-level tab state. "page" shows the current page's blocks; "global"
  // shows shared blocks (header/footer/site-wide). Switches automatically
  // when an EditableRegion belonging to the other tab is clicked.
  const [activeTab, setActiveTab] = useState(/** @type {"page"|"global"} */ ("page"));

  // Per-group collapse state. Storing the *closed* set (not open) means new
  // groups arriving via discovery default to expanded - which is what users
  // want on first sync.
  const [closedGroups, setClosedGroups] = useState(/** @type {Set<string>} */ (new Set()));

  const toggleGroup = (group) => {
    const closing = !closedGroups.has(group);
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
    // Closing a group with the active block inside it: drop the active
    // selection too. Otherwise the BlockCard's isActive useEffect
    // re-expands it the moment the group is reopened, producing a flash
    // of the previously-open editor before it settles back to collapsed.
    // Run this *outside* the setClosedGroups updater - React invokes
    // updater functions during render, and triggering another component's
    // setState from inside one warns "Cannot update ... while rendering".
    if (closing && activeBlock && blockPathPrefix(activeBlock) === group) {
      setActiveBlock(null);
    }
  };

  // Auto-open the panel when an EditableRegion in the page is clicked, and
  // switch to the tab that holds it so the matching block card scrolls into
  // view instead of staying hidden behind the wrong tab.
  useEffect(() => {
    if (!activeBlock) return;
    if (!isDrawerOpen) setDrawerOpen(true);
    const block = blocks.get(activeBlock);
    if (!block) return;
    const slug = block._slug ?? pathname;
    const tab = slug === pathname ? "page" : "global";
    setActiveTab(tab);
    // Make sure the active block's group is expanded. Ungrouped blocks
    // (no dot in path) have no group card, so there's nothing to expand.
    const prefix = blockPathPrefix(block.blockPath);
    if (prefix == null) return;
    setClosedGroups((prev) => {
      if (!prev.has(prefix)) return prev;
      const next = new Set(prev);
      next.delete(prefix);
      return next;
    });
  }, [activeBlock, blocks, pathname, isDrawerOpen, setDrawerOpen]);

  const isConflict = error instanceof CmsApiError && error.isConflict;
  const isForbidden = error instanceof CmsApiError && error.isForbidden;
  const breadcrumbs = pathnameToBreadcrumbs(pathname);

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
          />

          <TabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            pageCount={pageBlockList.length}
            globalCount={globalBlockList.length}
          />

          <GroupedBlockList
            blockList={activeTab === "page" ? pageBlockList : globalBlockList}
            drafts={drafts}
            setDraft={setDraft}
            clearDraft={clearDraft}
            activeBlockPath={activeBlock}
            onFocus={setActiveBlock}
            itemSchemas={itemSchemas}
            closedGroups={closedGroups}
            onToggleGroup={toggleGroup}
            emptyHint={
              activeTab === "page"
                ? "Bu sayfada düzenlenebilir blok yok. Yeni bloklar eklemek için manifest sync'ini çalıştır."
                : "Henüz scope=\"global\" işaretli blok yok."
            }
          />

          {error ? (
            <div style={isConflict ? conflictStyle : errorStyle}>
              {isConflict
                ? "Bir blok başka biri tarafından güncellendi. En son sürüm yüklendi - kontrol edip tekrar dene."
                : isForbidden
                  ? "Yetkiniz yok. Bu içeriği düzenleme izniniz bulunmuyor."
                  : (error.message ?? "Kaydedilemedi")}
            </div>
          ) : null}

          {dirtyCount > 0 || isSaving ? (
            <SaveBar
              dirtyCount={dirtyCount}
              isSaving={isSaving}
              onDiscard={onDiscardAll}
              onSave={onSaveAll}
            />
          ) : null}

          {userInfo ? (
            <PanelFooter userInfo={userInfo} onSignOut={onSignOut} />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          className="skylab-cms-handle"
          style={handleButtonStyle}
          aria-label={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
          aria-expanded={isDrawerOpen}
          title={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
        >
          <span
            className="skylab-cms-handle-slide"
            style={{
              ...handleIconStyle,
              // CSS variable consumed by `.skylab-cms-handle:hover .slide`.
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
 * }} props
 */
function PanelHeader({ breadcrumbs, dirty, draftSyncStatus }) {
  const pageLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? "";

  // Pill state precedence: a transient save/fail pulse wins over the
  // baseline dirty/clean colour so the admin sees autosave feedback even
  // mid-edit. `saving` doesn't change the dot - the user is still editing,
  // a colour shift mid-keystroke would feel jittery.
  const dotColor = (() => {
    if (draftSyncStatus === "saved") return STATUS_SAVED;
    if (draftSyncStatus === "failed") return STATUS_FAILED;
    return dirty ? ACCENT : "rgba(255,255,255,0.3)";
  })();
  const isPulsing = draftSyncStatus === "saved" || draftSyncStatus === "failed";
  const title = (() => {
    if (draftSyncStatus === "saving") return "Taslak kaydediliyor…";
    if (draftSyncStatus === "saved") return "Taslak kaydedildi";
    if (draftSyncStatus === "failed") return "Taslak kaydedilemedi";
    return dirty ? "Kaydedilmemiş değişiklik var" : "Tüm değişiklikler kaydedildi";
  })();

  return (
    <header style={headerStyle}>
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} style={breadcrumbItemWrapStyle}>
            {i > 0 ? <span style={breadcrumbSepStyle}>›</span> : null}
            <span
              style={
                i === breadcrumbs.length - 1
                  ? breadcrumbCurrentStyle
                  : breadcrumbInactiveStyle
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div style={titleBarStyle}>
        <h2 style={pageTitleStyle}>{pageLabel}</h2>
        <span
          style={{
            ...statusPillStyle,
            padding: "4px 9px 4px 7px",
          }}
          title={title}
        >
          <span
            // No re-key needed: every saved/failed signal first transitions
            // through "saving" (className removed → animation killed) and
            // then back to "saved"/"failed" (className re-added → animation
            // restarts naturally). The background-color transition fades
            // the dot smoothly between the four palette states.
            className={isPulsing ? "skylab-cms-status-pulse" : undefined}
            style={{
              ...statusDotStyle,
              background: dotColor,
              transition: "background-color 320ms ease",
            }}
          />
          <span style={statusLabelStyle}>Taslak</span>
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Block list (inline-editable cards)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   activeTab: "page" | "global",
 *   onChange: (tab: "page" | "global") => void,
 *   pageCount: number,
 *   globalCount: number,
 * }} props
 */
function TabBar({ activeTab, onChange, pageCount, globalCount }) {
  return (
    <div style={tabBarStyle} role="tablist">
      <TabButton
        label="Sayfa"
        count={pageCount}
        active={activeTab === "page"}
        onClick={() => onChange("page")}
      />
      <TabButton
        label="Genel"
        count={globalCount}
        active={activeTab === "global"}
        onClick={() => onChange("global")}
      />
    </div>
  );
}

/**
 * @param {{ label: string, count: number, active: boolean, onClick: () => void }} props
 */
function TabButton({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={active ? { ...tabButtonStyle, ...tabButtonActiveStyle } : tabButtonStyle}
    >
      <span>{label}</span>
      <span style={tabCountBadgeStyle}>{count}</span>
    </button>
  );
}

/**
 * Render the active tab's blocks grouped by blockPath prefix. Within each
 * group blocks keep their sortOrder. A group is the part of the path
 * before the first dot (e.g. "header.brand" -> "header"); paths without a
 * dot land in their own single-item group named after themselves.
 *
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 *   itemSchemas: Map<string, import("../lib/schemas.js").ItemSchema>,
 *   closedGroups: Set<string>,
 *   onToggleGroup: (group: string) => void,
 *   emptyHint: string,
 * }} props
 */
function GroupedBlockList({
  blockList, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, closedGroups, onToggleGroup, emptyHint,
}) {
  const chunks = useMemo(() => chunkBlocksByPrefix(blockList), [blockList]);

  return (
    <section style={paneStyle}>
      {blockList.length === 0 ? (
        <div style={emptyStateStyle}>{emptyHint}</div>
      ) : (
        <ul style={listStyle} data-cms-list>
          {chunks.map((chunk) =>
            chunk.type === "single" ? (
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
                  isOpen={!closedGroups.has(chunk.name)}
                  onToggle={() => onToggleGroup(chunk.name)}
                />
              </li>
            ),
          )}
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
 *   isOpen: boolean,
 *   onToggle: () => void,
 * }} props
 */
function GroupCard({
  groupName, blocks, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, isOpen, onToggle,
}) {
  return (
    <div style={groupCardStyle}>
      <div style={groupHeaderStyle} onClick={onToggle}>
        <span style={groupNameStyle}>{groupName}</span>
        <span style={groupCountStyle}>{blocks.length}</span>
        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED }}
        >
          <ChevronDown size={13} />
        </motion.span>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={groupBodyStyle}>
              {blocks.map((block) => (
                <BlockCard
                  key={block.blockPath}
                  block={block}
                  draft={drafts.get(block.blockPath)}
                  hasDraft={drafts.has(block.blockPath)}
                  isActive={activeBlockPath === block.blockPath}
                  onChange={(v) => setDraft(block.blockPath, v)}
                  onReset={() => resetBlock(block, setDraft, clearDraft)}
                  onFocus={() => onFocus(block.blockPath)}
                  itemSchema={itemSchemas.get(block.blockPath) ?? null}
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
 * Group prefix is the slice before the first dot. Paths without a dot
 * have no group - returning null tells the caller to render them flat
 * (no group card) instead of inventing a single-item group named after
 * the path itself.
 *
 * @param {string} blockPath
 * @returns {string | null}
 */
function blockPathPrefix(blockPath) {
  const dot = blockPath.indexOf(".");
  return dot === -1 ? null : blockPath.slice(0, dot);
}

/**
 * @typedef {{ type: "single", block: BlockResponse }
 *         | { type: "group", name: string, blocks: BlockResponse[] }} BlockChunk
 */

/**
 * Walk blocks in their incoming sortOrder and emit a flat list of chunks.
 * An ungrouped block (no dot in path) becomes a `single` chunk in place;
 * blocks sharing a prefix collapse into one `group` chunk that lives at
 * the prefix's *first* appearance. Result:
 *
 *   hero.title (1), hero.image (2), primary (3), skydays.eventdate (4)
 *   -> [Hero(2 items), primary(single), Skydays(1 item)]
 *
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
// Save bar (global dirty banner + actions)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   dirtyCount: number,
 *   isSaving: boolean,
 *   onDiscard: () => void,
 *   onSave: () => void,
 * }} props
 */
function SaveBar({ dirtyCount, isSaving, onDiscard, onSave }) {
  return (
    <div style={panelFooterStyle}>
      <div style={dirtyInlineStyle}>
        <span style={{ ...statusDotStyle, background: ACCENT }} />
        <span>
          {isSaving
            ? "Kaydediliyor…"
            : `${dirtyCount} kaydedilmemiş değişiklik`}
        </span>
      </div>
      <div style={footerActionsStyle}>
        <button type="button"
          onClick={onDiscard}
          className="skylab-cms-icon-action"
          style={iconActionStyle}
          aria-label="Tüm değişiklikleri iptal et"
          title="Tüm değişiklikleri iptal et"
          disabled={isSaving}
        >
          <Undo2 size={14} />
        </button>
        <button type="button"
          onClick={onSave}
          className="skylab-cms-icon-action skylab-cms-icon-action-primary"
          style={iconActionPrimaryStyle}
          aria-label="Tümünü kaydet"
          title="Tümünü kaydet"
          disabled={isSaving || dirtyCount === 0}
        >
          <Check size={14} />
          <span>Kaydet</span>
        </button>
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
        className="skylab-cms-logout"
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
 * `/about/team` → `[{label:"Anasayfa"}, {label:"About"}, {label:"Team"}]`.
 * `/` → `[{label:"Anasayfa"}]`.
 *
 * @param {string} pathname
 */
function pathnameToBreadcrumbs(pathname) {
  if (pathname === "/") return [{ label: "Anasayfa" }];
  const segments = pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  const crumbs = [{ label: "Anasayfa" }];
  for (const seg of segments) {
    const label = seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR"));
    crumbs.push({ label });
  }
  return crumbs;
}