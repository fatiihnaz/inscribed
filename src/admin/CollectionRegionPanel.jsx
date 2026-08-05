"use client";

/**
 * @file `CollectionRegionPanel`: the body for one collection. `scope`
 * decides what it addresses: `"page"` shows a section per `<CollectionRegion>`
 * binding the page declares, `"global"` shows the whole collection as a single
 * unfiltered section (the rail's Collections area).
 *
 * Layout: a record search, a "+ Yeni" row (when the collection supports
 * auto-generated slugs), then one row-list per section. Rows carry the same
 * two-line shape as the collections list a level up: a headline read from the
 * item's own data via `titleFieldName`, with the slug beneath it as the
 * identifier. Clicking one pushes a full-height detail pane in from the left
 * while the list layer parallax-slides right and dims; the list stays mounted
 * underneath so caches and scroll survive the round-trip.
 *
 * Each filter section owns its offset/limit and accumulates pages via "Load
 * more", using exactly the filter the region declared (filter parity). Search
 * runs over that loaded window only, and says so when more rows remain.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Undo2, Search } from "../shared/style/icons.jsx";

import { useCollectionContext } from "../collections/context.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyRecords, dirtySlugsFor } from "./dirty.js";
import { buildListParams } from "../collections/params.js";
import { useCollection } from "../collections/hooks/use-collection.js";
import { useCollectionCreate } from "../collections/hooks/use-collection-create.js";
import { useCreateDraftRole, useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";
import { useCollectionMeta } from "../collections/hooks/use-my-collections.js";
import { NEW_DRAFT_GUID } from "../shared/contracts/schemas.js";
import { stableStringify } from "../shared/util/stable-stringify.js";

import { useCollectionEditor } from "../collections/hooks/use-collection-editor.js";
import { CollectionRecordForm, DraftIndicator } from "./CollectionRecordForm.jsx";
import { CollectionFieldsForm } from "../collections/CollectionFieldsForm.jsx";
import { emptyStateStyle } from "../editors/fields/styles.js";
import { buttonBaseStyle, paneStyle, btnGhostStyle, searchWrapStyle, searchInputStyle, searchClearStyle } from "./drawer-styles.js";
import { BG, BG_RAISED, TEXT, TEXT_MID, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, COLLECTION_SOFT, COLLECTION_LINE, STATUS_DANGER, BORDER, HAIRLINE, SURFACE_1, FONT_MONO, FONT_SANS, RADIUS, R_BADGE, R_SM, R_BTN } from "../shared/style/tokens.js";

const DEFAULT_DRAWER_PAGE_SIZE = 50;

// Shared by the pane slide-in and the list's parallax counter-slide so the two
// layers move in lockstep. The pane enters from the LEFT (the drawer's own
// anchor edge, so depth reads as coming out of the panel), the list recedes
// right.
const PANE_TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0.18, 1] };
// The pane's cast shadow reaches past its own right edge, so at x=-100% the
// slide reads as finished while the shadow still sits over the list, and the
// unmount snaps it away. Fading only the tail of the exit removes both together.
const PANE_EXIT_TRANSITION = {
  ...PANE_TRANSITION,
  opacity: { duration: 0.12, delay: 0.18, ease: "linear" },
};
// How far the list layer recedes while a pane is open.
const PARALLAX_SHIFT = "28%";

/**
 * @typedef {{ mode: "edit", slug: string }
 *   | { mode: "create", translationOf?: string, locale?: string }
 *   | null} PaneState
 *
 * Create mode carries the translation target when it was opened from a
 * record's chip strip: the group says what it links to, and the locale says
 * which language to write, which is not the route's (the editor is reading the
 * Turkish page while composing the English copy).
 */


// Field names that conventionally hold an item's human title, in priority
// order; anything else falls back to the schema's first textual field.
const TITLE_FIELD_NAMES = ["title", "name", "heading", "başlık", "baslik", "ad"];
const TEXTUAL_FIELD_TYPES = new Set(["ShortText", "LongText"]);

/**
 * Name of the field whose value should headline a row, or null when the schema
 * offers nothing textual. Null is a real answer: the caller then shows the slug
 * alone rather than inventing a label.
 *
 * @param {import("../shared/contracts/schemas.js").CollectionSchema | null | undefined} schema
 * @returns {string | null}
 */
function titleFieldName(schema) {
  const fields = schema?.fields;
  if (!fields || fields.length === 0) return null;
  for (const wanted of TITLE_FIELD_NAMES) {
    const hit = fields.find((f) => f.name.toLowerCase() === wanted);
    if (hit) return hit.name;
  }
  const textual = fields.find((f) => TEXTUAL_FIELD_TYPES.has(f.type));
  return textual ? textual.name : null;
}

/**
 * Row headline for one item. Reads the draft first: while an item is being
 * edited its draft title is what the user expects to see in the list.
 *
 * @param {import("../shared/contracts/schemas.js").CollectionItemResponse} item
 * @param {string | null} field
 * @returns {string | null}
 */
function itemTitle(item, field) {
  if (!field) return null;
  const data = item.draftData ?? item.data;
  const raw = data ? data[field] : undefined;
  if (typeof raw !== "string") return null;
  return raw.trim() || null;
}

/**
 * @param {{ collectionKey: string, scope?: "page" | "global" }} props
 */
export function CollectionRegionPanel({ collectionKey, scope = "page" }) {
  const { collectionStore, setActiveCollectionItem } = useCollectionContext();
  const collectionBindings = useStoreSelector(collectionStore, (s) => s.bindings);
  const activeCollectionItem = useStoreSelector(collectionStore, (s) => s.activeItem);

  const meta = useCollectionMeta(collectionKey);
  const canCreate = Boolean(meta?.canCreate);
  const isAutoGenerated = meta?.slugSource === "AutoGenerated";
  const supportsCreate = canCreate && isAutoGenerated;

  const [pane, setPane] = useState(/** @type {PaneState} */ (null));
  const [query, setQuery] = useState("");

  const titleField = useMemo(() => titleFieldName(meta?.schema), [meta]);

  // StatusBar "Aç" jump: consume the signal here and open the detail pane
  // directly. Pane-level fetch by slug means the jump works even when the
  // target sits past the loaded list window.
  useEffect(() => {
    if (!activeCollectionItem) return;
    if (activeCollectionItem.key !== collectionKey) return;
    setPane({ mode: "edit", slug: activeCollectionItem.slug });
    setActiveCollectionItem(null);
  }, [activeCollectionItem, collectionKey, setActiveCollectionItem]);

  // Per-slug dirty from the shared store (live overlay drafts + cached items
  // carrying server draftData), so rows don't each mount an editor hook.
  const drafts = useStoreSelector(collectionStore, (s) => s.drafts);
  const itemCache = useStoreSelector(collectionStore, (s) => s.itemCache);
  const dirtySlugs = useMemo(
    () => dirtySlugsFor(collectDirtyRecords(drafts, itemCache), collectionKey),
    [drafts, itemCache, collectionKey],
  );

  const sections = useMemo(() => {
    // Collections mode addresses the collection itself, so it shows one
    // unfiltered section regardless of what this page happens to bind. Without
    // this the panel would fall to the empty state for any collection the
    // current page doesn't declare.
    if (scope === "global") {
      return [{ signature: "global", filter: undefined, pageLimit: undefined, pageOffset: undefined }];
    }
    /** @type {Map<string, { filter: Record<string, *> | undefined, pageLimit: number | undefined, pageOffset: number | undefined }>} */
    const bySignature = new Map();
    for (const [, binding] of collectionBindings) {
      if (binding.slug) continue;
      if (binding.collection !== collectionKey) continue;
      const signature = stableStringify(binding.filter ?? null);
      if (bySignature.has(signature)) continue;
      bySignature.set(signature, {
        filter: binding.filter,
        pageLimit: binding.limit,
        pageOffset: binding.offset,
      });
    }
    return [...bySignature.entries()].map(([signature, info]) => ({ signature, ...info }));
  }, [collectionBindings, collectionKey, scope]);

  // CreateLane reads the new-item draft sentinel from an unfiltered list
  // response. Reuse the unfiltered section's params if the page declares one,
  // else fall back to a dedicated unfiltered fetch.
  const createListParams = useMemo(() => {
    const unfiltered = sections.find((s) => s.filter === undefined);
    return buildListParams({ offset: unfiltered?.pageOffset ?? 0, limit: unfiltered?.pageLimit });
  }, [sections]);

  const isPaneOpen = pane != null;

  return (
    // `position: relative` + `overflow: hidden` make the section the frame the
    // detail panes slide inside of.
    <section style={{ ...paneStyle, position: "relative", overflow: "hidden" }}>
      <motion.div
        initial={false}
        animate={isPaneOpen
          ? { x: PARALLAX_SHIFT, opacity: 0.4 }
          : { x: "0%", opacity: 1 }}
        transition={PANE_TRANSITION}
        style={{
          ...listLayerStyle,
          // The opaque pane covers the layer at rest; this only guards clicks
          // and tab focus during the transition frames.
          pointerEvents: isPaneOpen ? "none" : "auto",
        }}
        aria-hidden={isPaneOpen}
      >
        <div style={searchBarStyle}>
          <div className="inscribed-search" style={searchWrapStyle}>
            <Search size={13} color={TEXT_FAINT} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kayıt ara"
              aria-label="Kayıt ara"
              style={searchInputStyle}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inscribed-search-clear"
                style={searchClearStyle}
                aria-label="Temizle"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        {supportsCreate && meta?.schema ? (
          <CreateButton
            collectionKey={collectionKey}
            listParams={createListParams}
            onOpen={() => setPane({ mode: "create" })}
          />
        ) : null}

        <div style={regionScrollStyle}>
          {sections.length === 0 ? (
            <div style={emptyStateStyle}>
              Bu sayfa <code>{collectionKey}</code> için bir region binding'i göstermiyor.
            </div>
          ) : (
            sections.map((section) => (
              <RegionSection
                key={section.signature}
                collectionKey={collectionKey}
                filter={section.filter}
                pageLimit={section.pageLimit}
                pageOffset={section.pageOffset}
                showHeader={sections.length > 1 || section.filter !== undefined}
                dirtySlugs={dirtySlugs}
                titleField={titleField}
                query={query}
                onOpenItem={(slug) => setPane({ mode: "edit", slug })}
              />
            ))
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {pane?.mode === "edit" ? (
          <ItemDetailPane
            key={`edit:${pane.slug}`}
            collectionKey={collectionKey}
            slug={pane.slug}
            onBack={() => setPane(null)}
            onOpenItem={(next) => setPane({ mode: "edit", slug: next })}
            onAddTranslation={(locale, translationOf) =>
              setPane({ mode: "create", translationOf, locale })}
          />
        ) : pane?.mode === "create" && meta?.schema ? (
          <CreatePane
            // Keyed by target so switching which record is being translated
            // remounts the form instead of carrying the previous one's values.
            key={`create:${pane.translationOf ?? ""}:${pane.locale ?? ""}`}
            collectionKey={collectionKey}
            schema={meta.schema}
            listParams={createListParams}
            translationOf={pane.translationOf}
            locale={pane.locale}
            onClose={() => setPane(null)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const listLayerStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  // See `collectionsLayerStyle`: promoted so the recede animation composites
  // rather than repainting every row each frame.
  willChange: "transform, opacity",
});

const regionScrollStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  paddingBottom: 16,
});

// ---------------------------------------------------------------------------
// Region section: humanized filter header + row list + load more
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   collectionKey: string,
 *   filter: Record<string, *> | undefined,
 *   pageLimit: number | undefined,
 *   pageOffset: number | undefined,
 *   showHeader: boolean,
 *   dirtySlugs: Set<string>,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
function RegionSection({
  collectionKey, filter, pageLimit, pageOffset, showHeader, dirtySlugs,
  titleField, query, onOpenItem,
}) {
  const initialLimit = pageLimit ?? DEFAULT_DRAWER_PAGE_SIZE;
  const initialOffset = pageOffset ?? 0;
  const [offset, setOffset] = useState(initialOffset);
  const [limit] = useState(initialLimit);

  const filterKey = stableStringify(filter ?? null);
  const [accumulated, setAccumulated] = useState(
    /** @type {import("../shared/contracts/schemas.js").CollectionItemResponse[]} */ ([]),
  );

  const params = useMemo(
    () => buildListParams({ filter, offset, limit }),
    [filter, offset, limit],
  );
  const { items, total, isLoading, error, refetch } = useCollection(collectionKey, params);

  useEffect(() => {
    setOffset(initialOffset);
    setAccumulated([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (isLoading || error) return;
    // Drop only the slug-less new-item sentinel (AutoGenerated's create draft).
    // A boot-GUID row that carries a slug is a RoleDerived virtual item, the
    // user's own editable row, so it stays and renders as a normal row.
    const real = items.filter((row) => row.id !== NEW_DRAFT_GUID || row.slug);
    if (offset === initialOffset) {
      setAccumulated(real);
    } else {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((row) => row.slug));
        return [...prev, ...real.filter((row) => !seen.has(row.slug))];
      });
    }
  }, [items, isLoading, error, offset, initialOffset]);

  const canLoadMore = accumulated.length < total;
  const loadMore = () => setOffset((o) => o + limit);
  const remaining = Math.max(0, total - accumulated.length);

  // Client-side over the loaded window only: the list endpoint filters by the
  // region's declared fields, not by free text, so searching cannot be pushed
  // to the server without changing the contract.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accumulated;
    return accumulated.filter((item) => {
      if (item.slug.toLowerCase().includes(q)) return true;
      const title = itemTitle(item, titleField);
      return title != null && title.toLowerCase().includes(q);
    });
  }, [accumulated, query, titleField]);
  const isSearching = query.trim().length > 0;

  return (
    <div style={sectionWrapStyle}>
      {showHeader ? (
        <RegionHeader filter={filter} loaded={accumulated.length} total={total} />
      ) : null}

      {error ? (
        <div style={errorBoxStyle}>
          <span style={{ flex: 1 }}>Liste alınamadı: {error.message}</span>
          <button
            type="button"
            onClick={refetch}
            className="inscribed-text-button"
            style={retryTextStyle}
          >
            Yeniden dene
          </button>
        </div>
      ) : isLoading && accumulated.length === 0 ? (
        <div style={emptyStateStyle}>Yükleniyor…</div>
      ) : accumulated.length === 0 ? (
        <div style={emptyStateStyle}>Bu filtre için kayıt yok.</div>
      ) : visible.length === 0 ? (
        <div style={emptyStateStyle}>
          {`"${query}" araması yüklenmiş kayıtlarda sonuç vermedi.`}
        </div>
      ) : (
        <ul style={rowGroupStyle} data-cms-list>
          {visible.map((item) => (
            <li key={item.slug} style={{ listStyle: "none" }}>
              <RegionItemRow
                slug={item.slug}
                title={itemTitle(item, titleField)}
                canEdit={item.canEdit}
                dirty={dirtySlugs.has(item.slug)}
                onOpen={() => onOpenItem(item.slug)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Search only sees the loaded window, so say so rather than letting a
          short result list read as "that's everything". */}
      {isSearching && canLoadMore ? (
        <div style={searchScopeNoteStyle}>
          Yalnızca yüklenmiş {accumulated.length} kayıt arandı, {remaining} kayıt daha var.
        </div>
      ) : null}

      {canLoadMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoading}
          className="inscribed-load-more"
          style={loadMoreStyle}
        >
          {isLoading ? "Yükleniyor…" : `Daha fazla yükle (${remaining} kalan)`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Humanized section header: one chip per filter entry ("Tümü" when
 * unfiltered), loaded/total count right-aligned.
 *
 * @param {{ filter: Record<string, *> | undefined, loaded: number, total: number }} props
 */
function RegionHeader({ filter, loaded, total }) {
  const entries = filter ? Object.entries(filter) : [];
  return (
    <div style={regionHeaderStyle}>
      {entries.length === 0 ? (
        <span style={regionAllLabelStyle}>Tümü</span>
      ) : (
        entries.map(([key, value]) => (
          <span key={key} style={filterChipStyle}>
            <span style={filterChipKeyStyle}>{key}</span>
            <span style={filterChipValueStyle}>{String(value)}</span>
          </span>
        ))
      )}
      <span style={regionCountStyle}>{loaded} / {total}</span>
    </div>
  );
}

/**
 * One collection item as a quiet list row: slug, readonly chip, dirty dot,
 * trailing chevron. All editing happens in the detail pane.
 *
 * @param {{ slug: string, canEdit: boolean, dirty: boolean, onOpen: () => void }} props
 */
function RegionItemRow({ slug, title, canEdit, dirty, onOpen }) {
  // No title resolves when the schema has no textual field: the slug then takes
  // the headline and keeps its identifier styling instead of being dressed up
  // as prose.
  const headline = title ?? slug;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inscribed-region-row"
      style={rowStyle}
    >
      <span style={rowTextColStyle}>
        <span style={rowHeadlineRowStyle}>
          <span style={title ? rowTitleStyle : rowSlugHeadlineStyle} title={headline}>
            {headline}
          </span>
          {!canEdit ? <span style={readonlyChipStyle}>salt okunur</span> : null}
          {dirty ? (
            <span style={rowDirtyDotStyle} aria-label="Kaydedilmemiş değişiklik" />
          ) : null}
        </span>
        {title ? (
          <span style={rowSlugStyle} title={slug}>{slug}</span>
        ) : null}
      </span>

      <span className="inscribed-region-row-chevron" style={rowChevronStyle} aria-hidden="true">
        <ChevronRight size={13} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail pane shell (shared by edit + create)
// ---------------------------------------------------------------------------

/**
 * Full-height pane sliding in from the right over the row list. Back header on
 * top, scrollable body, optional pinned action footer. Escape goes back.
 *
 * @param {{
 *   onBack: () => void,
 *   title: string,
 *   meta?: React.ReactNode,
 *   footer?: React.ReactNode,
 *   children: React.ReactNode,
 * }} props
 */
function DetailPane({ onBack, title, meta, subhead, footer, children }) {
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={PANE_EXIT_TRANSITION}
      style={detailPaneStyle}
      role="region"
      aria-label={title}
    >
      <header style={detailHeaderStyle}>
        <button
          type="button"
          onClick={onBack}
          className="inscribed-pane-back"
          style={paneBackStyle}
          aria-label="Listeye dön"
          title="Listeye dön (Esc)"
        >
          <ChevronLeft size={15} />
        </button>
        <span style={detailTitleStyle} title={title}>{title}</span>
        {meta}
      </header>
      {subhead}
      <div style={detailBodyStyle}>{children}</div>
      {footer ? <footer style={detailFooterStyle}>{footer}</footer> : null}
    </motion.div>
  );
}

/**
 * One chip per language the collection declares, showing which of them this
 * record's translation group actually has.
 *
 * This is what keeps the "add a translation" action honest: a language that
 * already exists offers to open it instead of creating a second one. The
 * backend rejects the duplicate either way, but by then the editor has already
 * written the record, and the rejection can't tell them where the existing one
 * is.
 *
 * Renders nothing for a collection with no declared languages, which is every
 * collection on a backend without translation support.
 *
 * @param {{
 *   item: import("../shared/contracts/schemas.js").CollectionItemResponse | null,
 *   locales: string[] | undefined,
 *   canEdit: boolean,
 *   onOpenItem: (slug: string) => void,
 *   onAddTranslation: (locale: string, translationGroupId: string) => void,
 * }} props
 */
function TranslationChips({ item, locales, canEdit, onOpenItem, onAddTranslation }) {
  const bySlug = useMemo(() => {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const t of item?.translations ?? []) out.set(t.locale, t.slug);
    return out;
  }, [item]);

  if (!locales?.length || !item) return null;
  const groupId = item.translationGroupId;

  return (
    <div style={translationBarStyle}>
      {locales.map((locale) => {
        const label = locale.toUpperCase();
        if (locale === item.locale) {
          return <span key={locale} style={localeChipCurrentStyle}>{label}</span>;
        }

        const sibling = bySlug.get(locale);
        if (sibling) {
          return (
            <button
              key={locale}
              type="button"
              onClick={() => onOpenItem(sibling)}
              style={localeChipStyle}
              title={`${label}: ${sibling}`}
            >
              {label}
            </button>
          );
        }

        // No sibling yet. Without a group there is nothing to attach one to,
        // so the affordance stays hidden rather than offering an orphan.
        if (!canEdit || !groupId) return null;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onAddTranslation(locale, groupId)}
            style={localeChipAddStyle}
            title={`${label} çevirisini ekle`}
          >
            + {label}
          </button>
        );
      })}
    </div>
  );
}

const translationBarStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  gap: 4,
  alignItems: "center",
  padding: "6px 12px",
  borderBottom: `1px solid ${HAIRLINE}`,
  flexShrink: 0,
});

const localeChipBase = /** @type {React.CSSProperties} */ ({
  font: `600 9px/1 ${FONT_SANS}`,
  letterSpacing: "0.05em",
  padding: "4px 7px",
  borderRadius: R_BADGE,
  border: 0,
  background: "transparent",
});

const localeChipCurrentStyle = /** @type {React.CSSProperties} */ ({
  ...localeChipBase,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
});

const localeChipStyle = /** @type {React.CSSProperties} */ ({
  ...localeChipBase,
  background: SURFACE_1,
  color: TEXT_MID,
  cursor: "pointer",
});

const localeChipAddStyle = /** @type {React.CSSProperties} */ ({
  ...localeChipBase,
  color: TEXT_FAINT,
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  cursor: "pointer",
});

/**
 * Detail pane for one existing (or RoleDerived virtual) collection row.
 * `useCollectionEditor` is lifted here so the footer actions and the form body
 * share one state.
 *
 * @param {{
 *   collectionKey: string,
 *   slug: string,
 *   onBack: () => void,
 *   onOpenItem: (slug: string) => void,
 *   onAddTranslation: (locale: string, translationGroupId: string) => void,
 * }} props
 */
function ItemDetailPane({ collectionKey, slug, onBack, onOpenItem, onAddTranslation }) {
  // The pane is always on screen when mounted, so it mirrors; whether it also
  // writes depends on the page not already owning the record's draft.
  const role = useDrawerDraftRole(collectionKey, slug, true);
  const editor = useCollectionEditor(collectionKey, slug, role);
  const meta = useCollectionMeta(collectionKey);
  const isDirty = editor.hasDraft && editor.canEdit;

  return (
    <DetailPane
      onBack={onBack}
      title={slug}
      subhead={
        <TranslationChips
          item={editor.item}
          locales={meta?.locales}
          canEdit={editor.canEdit}
          onOpenItem={onOpenItem}
          onAddTranslation={onAddTranslation}
        />
      }
      meta={
        <>
          {editor.item && !editor.canEdit ? (
            <span style={readonlyChipStyle}>readonly</span>
          ) : null}
          {editor.item ? (
            <span style={detailVersionStyle}>
              {editor.isVirtual ? "yeni" : `v${editor.item.version}`}
            </span>
          ) : null}
        </>
      }
      footer={editor.canEdit ? (
        <>
          <DraftIndicator
            status={editor.draftStatus}
            lastSavedAt={editor.lastDraftSavedAt}
            hasServerDraft={editor.item?.draftData != null}
            publishedFlash={editor.publishedFlash}
          />
          <span style={{ flex: 1 }} />
          {isDirty ? (
            <button
              type="button"
              onClick={editor.undoDraft}
              disabled={editor.isPending}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label="Bu kaydın değişikliklerini geri al"
              title="Geri al"
            >
              <Undo2 size={13} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={editor.save}
            disabled={editor.isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {editor.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </>
      ) : null}
    >
      <CollectionRecordForm editor={editor} showMetaRow={false} showActions={false} />
    </DetailPane>
  );
}

// ---------------------------------------------------------------------------
// Create: pinned toolbar row (list layer) + create-mode detail pane (overlay)
// ---------------------------------------------------------------------------

/**
 * "+ Yeni" toolbar row for AutoGenerated collections. Lives inside the
 * parallax list layer, so the create pane itself renders separately in the
 * panel's overlay slot; the two talk through the shared list cache (the
 * slug-less sentinel row's `draftData` is the stashed new-item draft).
 *
 * @param {{
 *   collectionKey: string,
 *   listParams: import("../shared/contracts/schemas.js").CollectionListParams,
 *   onOpen: () => void,
 * }} props
 */
function CreateButton({ collectionKey, listParams, onOpen }) {
  const { items } = useCollection(collectionKey, listParams);
  const hasServerDraft = items.some(
    (row) => row.id === NEW_DRAFT_GUID && !row.slug && row.draftData != null,
  );

  return (
    <div style={createBarStyle}>
      <button
        type="button"
        onClick={onOpen}
        className="inscribed-create-row"
        style={createButtonStyle}
      >
        <Plus size={13} />
        <span style={{ flex: 1 }}>Yeni {collectionKey}</span>
        {hasServerDraft ? <span style={draftBadgeStyle}>taslak</span> : null}
      </button>
    </div>
  );
}

/**
 * Create-mode detail pane. Mounts fresh per open: `useCollectionCreate` seeds
 * from the stashed backend draft (if any) and autosaves while mounted. Back
 * keeps the draft (autosaved); "Vazgeç" wipes it.
 *
 * @param {{
 *   collectionKey: string,
 *   schema: import("../shared/contracts/schemas.js").CollectionSchema,
 *   listParams: import("../shared/contracts/schemas.js").CollectionListParams,
 *   translationOf?: string,
 *   locale?: string,
 *   onClose: () => void,
 * }} props
 */
function CreatePane({ collectionKey, schema, listParams, translationOf, locale, onClose }) {
  // A page-level <CollectionComposer> may be open on the same collection, and
  // both would write its single new-item slot; the first to claim it wins.
  const scopeId = useId();
  const isDraftWriter = useCreateDraftRole(collectionKey, scopeId);
  const {
    values,
    setValues,
    submit,
    deleteDraft,
    hasServerDraft,
    isPending,
    error,
  } = useCollectionCreate({
    collectionKey,
    schema,
    // Share the page's list window so the sentinel lookup hits the cache
    // instead of a separate GET.
    listParams,
    active: isDraftWriter,
    translationOf,
    locale,
  });

  return (
    <DetailPane
      onBack={onClose}
      title={translationOf && locale ? `Yeni ${collectionKey} · ${locale.toUpperCase()}` : `Yeni ${collectionKey}`}
      meta={hasServerDraft ? <span style={draftBadgeStyle}>taslak</span> : null}
      footer={
        <>
          <button
            type="button"
            onClick={() => { deleteDraft(); onClose(); }}
            disabled={isPending}
            className="inscribed-btn-ghost"
            style={btnGhostStyle}
          >
            Vazgeç
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => submit(onClose)}
            disabled={isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {isPending ? "Oluşturuluyor…" : "Oluştur"}
          </button>
        </>
      }
    >
      <div style={createFormWrapStyle}>
        <CollectionFieldsForm
          fields={schema.fields}
          values={values}
          onChange={setValues}
          disabled={isPending}
        />
        {error ? <div style={errorInlineStyle}>{error}</div> : null}
      </div>
    </DetailPane>
  );
}

// ---- Styles ----------------------------------------------------------------

const sectionWrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 4,
});

const regionHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  padding: "14px 16px 4px",
});

const regionAllLabelStyle = /** @type {React.CSSProperties} */ ({
  font: `500 10.5px/1 ${FONT_SANS}`,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
  color: TEXT_MUTED,
});

const filterChipStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 7px",
  borderRadius: R_BADGE,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  font: `500 10.5px/1 ${FONT_MONO}`,
});

const filterChipKeyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
});

const filterChipValueStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MID,
});

const regionCountStyle = /** @type {React.CSSProperties} */ ({
  marginLeft: "auto",
  font: `500 10.5px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
});

const rowGroupStyle = /** @type {React.CSSProperties} */ ({
  margin: "0 16px",
  padding: 0,
  borderRadius: RADIUS,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  overflow: "hidden",
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "9px 12px",
  border: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

// Two lines, no leading badge: an initial derived from the title would just
// restate what the title already says. The collections list one level up keeps
// its badge because a collection is a category you learn to recognise; a record
// is identified by its own headline.
const rowTextColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const rowHeadlineRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
});

// The headline is prose (a field value), so it takes the sans.
const rowTitleStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  font: `500 12px/1.2 ${FONT_SANS}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Fallback headline: still an identifier, so it keeps the mono.
const rowSlugHeadlineStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  font: `500 12px/1.2 ${FONT_MONO}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Secondary line under a resolved title.
const rowSlugStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  font: `500 10.5px/1.2 ${FONT_MONO}`,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const searchBarStyle = /** @type {React.CSSProperties} */ ({
  padding: "10px 16px 6px",
  flexShrink: 0,
});

const searchScopeNoteStyle = /** @type {React.CSSProperties} */ ({
  padding: "2px 16px 0",
  font: `10.5px/1.4 ${FONT_SANS}`,
  color: TEXT_MUTED,
});

const rowDirtyDotStyle = /** @type {React.CSSProperties} */ ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
  flexShrink: 0,
});

const rowChevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: TEXT_FAINT,
  flexShrink: 0,
});

const readonlyChipStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textTransform: "uppercase",
  fontSize: 9,
  padding: "1px 6px",
  background: SURFACE_1,
  borderRadius: 3,
  letterSpacing: "0.05em",
  flexShrink: 0,
});

const errorBoxStyle = /** @type {React.CSSProperties} */ ({
  margin: "0 16px 4px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, var(--ins-text, #fff))`,
  fontSize: 12,
  padding: "8px 10px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 8%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 25%, transparent)`,
  borderRadius: R_SM,
});

const retryTextStyle = /** @type {React.CSSProperties} */ ({
  background: "transparent",
  color: TEXT_MUTED,
  border: 0,
  borderRadius: R_BADGE,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: FONT_SANS,
});

const loadMoreStyle = /** @type {React.CSSProperties} */ ({
  alignSelf: "center",
  margin: "4px auto 12px",
  padding: "7px 16px",
  background: "transparent",
  color: TEXT_MUTED,
  border: `1px solid ${BORDER}`,
  borderRadius: R_BTN,
  cursor: "pointer",
  font: `12px ${FONT_SANS}`,
  fontFamily: FONT_SANS,
});

// -- Detail pane --

// No z-index on purpose: DOM order already stacks the pane above the list
// layer, and any z here would lift the pane over the drawer handle's 4px
// overlap at the panel edge (the handle must keep painting on top).
const detailPaneStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: BG,
  // Right-edge hairline + soft cast shadow (the pane enters from the left):
  // separates the pane from the receding list layer while the two slide.
  boxShadow: `1px 0 0 ${HAIRLINE}, 16px 0 36px rgba(0, 0, 0, 0.35)`,
  willChange: "transform",
});

const detailHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
  flexShrink: 0,
});

const paneBackStyle = /** @type {React.CSSProperties} */ ({
  width: 24,
  height: 24,
  marginLeft: -6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  border: 0,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
});

const detailTitleStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  font: `500 12.5px/1.2 ${FONT_MONO}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const detailVersionStyle = /** @type {React.CSSProperties} */ ({
  font: `500 11px/1 ${FONT_MONO}`,
  color: TEXT_MUTED,
  flexShrink: 0,
});

const detailBodyStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  padding: "14px 16px 16px",
});

const detailFooterStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_RAISED,
  flexShrink: 0,
});

const saveButtonStyle = /** @type {React.CSSProperties} */ ({
  ...buttonBaseStyle,
  fontWeight: 600,
});

// -- Create lane --

const createBarStyle = /** @type {React.CSSProperties} */ ({
  padding: "0 16px 8px",
  flexShrink: 0,
});

const createButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  background: "transparent",
  border: 0,
  borderRadius: R_BTN,
  color: TEXT_MID,
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: FONT_SANS,
});

const draftBadgeStyle = /** @type {React.CSSProperties} */ ({
  font: `600 9px/1 ${FONT_SANS}`,
  letterSpacing: "0.045em",
  textTransform: "uppercase",
  padding: "3px 6px",
  borderRadius: R_BADGE,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
  flexShrink: 0,
});

const createFormWrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const errorInlineStyle = /** @type {React.CSSProperties} */ ({
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, var(--ins-text, #fff))`,
  fontSize: 12,
  padding: "8px 10px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 30%, transparent)`,
  borderRadius: R_SM,
});
