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
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Undo2, Search } from "../shared/style/icons.jsx";

import { useCollectionContext } from "../collections/context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyRecords, dirtySlugsFor } from "./dirty.js";
import { buildListParams, DEFAULT_SORT } from "../collections/params.js";
import { useCollection } from "../collections/hooks/use-collection.js";
import { useCollectionCreate } from "../collections/hooks/use-collection-create.js";
import { useCreateDraftRole, useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";
import { useCollectionMeta } from "../collections/hooks/use-my-collections.js";
import { useCollectionLocale } from "../collections/hooks/use-collection-locale.js";
import { stableStringify } from "../shared/util/stable-stringify.js";

import { useCollectionEditor } from "../collections/hooks/use-collection-editor.js";
import { Menu } from "./Menu.jsx";
import { CollectionRecordForm, DraftIndicator } from "./CollectionRecordForm.jsx";
import { CollectionFieldsForm, SlugField } from "../collections/CollectionFieldsForm.jsx";
import { emptyStateStyle } from "../editors/fields/styles.js";
import { buttonBaseStyle, paneStyle, btnGhostStyle, searchWrapStyle, searchInputStyle, searchClearStyle, dirtyDotStyle, rowPathStyle } from "./drawer-styles.js";
import { BG, BG_RAISED, TEXT, TEXT_MID, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, COLLECTION_SOFT, COLLECTION_LINE, STATUS_DANGER, BORDER, HAIRLINE, SURFACE_1, FONT_MONO, FONT_SANS, PANEL_TRANSITION, R_BADGE, R_MD, R_SM, R_BTN } from "../shared/style/tokens.js";

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
 * Columns `?sort=` accepts for this collection: three the backend always
 * offers, plus whatever the schema marks sortable. Built from the schema rather
 * than hardcoded, because which fields carry an index is per collection.
 *
 * @param {import("../shared/contracts/schemas.js").CollectionSchema | null | undefined} schema
 * @returns {{ value: string, labelKey?: string, label?: string }[]}
 */
function sortableColumns(schema) {
  const base = [
    { value: "slug", labelKey: "collections.sortSlug" },
    { value: "createdAt", labelKey: "collections.sortCreatedAt" },
    { value: "updatedAt", labelKey: "collections.sortUpdatedAt" },
  ];
  const own = (schema?.fields ?? [])
    .filter((f) => f.sortable)
    .map((f) => ({ value: f.name, label: f.label || f.name }));
  return [...base, ...own];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact age, for the right edge of a row. Switches to a plain date after a
 * week, where "23d" stops being a span anyone can picture.
 *
 * @param {string | undefined} iso
 * @param {(key: string, vars?: Record<string, *>) => string} t
 * @returns {string | null}
 */
function shortAge(iso, t) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const elapsed = Date.now() - then;
  // A clock skewed a little ahead of the server would otherwise render "-0m".
  if (elapsed < MINUTE) return t("collections.timeNow");
  if (elapsed < HOUR) return t("collections.timeMinutes", { n: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t("collections.timeHours", { n: Math.floor(elapsed / HOUR) });
  if (elapsed < 7 * DAY) return t("collections.timeDays", { n: Math.floor(elapsed / DAY) });
  return new Date(then).toLocaleDateString();
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
  const t = useCmsStrings();
  const { collectionStore, setActiveCollectionItem } = useCollectionContext();
  const collectionBindings = useStoreSelector(collectionStore, (s) => s.bindings);
  const activeCollectionItem = useStoreSelector(collectionStore, (s) => s.activeItem);

  const meta = useCollectionMeta(collectionKey);
  const canCreate = Boolean(meta?.canCreate);
  // ClaimDerived stays out even with the permission: those slugs come from the
  // caller's claims and arrive as derived rows, so there is nothing a free-form
  // create form could name. The other two both compose here, one naming its own
  // slug and one letting the backend derive it.
  const supportsCreate = canCreate && meta?.slugSource !== "ClaimDerived";

  const [pane, setPane] = useState(/** @type {PaneState} */ (null));
  const [query, setQuery] = useState("");
  // Sort and archive sit at panel level rather than per section: the search box
  // above them already scopes the whole panel, and a page binding three regions
  // wants one answer to "what am I looking at", not three.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [showArchived, setShowArchived] = useState(false);
  // Which language the panel is working in. Null means the route's, which is
  // where an editor starts; picking another one is what lets them read the
  // English rows and compose a new English record without leaving the page.
  const [pickedLocale, setPickedLocale] = useState(/** @type {string | null} */ (null));
  const routeLocale = useCollectionLocale(collectionKey);
  // Checked against this collection rather than kept as picked: the panel is
  // reused across collections, and the one being shown now may not hold the
  // language the last one was switched to.
  const locale = pickedLocale && meta?.locales?.includes(pickedLocale)
    ? pickedLocale
    : routeLocale;

  const titleField = useMemo(() => titleFieldName(meta?.schema), [meta]);
  const sortOptions = useMemo(() => sortableColumns(meta?.schema), [meta]);

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

  // The window the panel reads `virtualItems` from: the pending draft behind
  // the create button, and the derived rows below. Any window carries the same
  // array, so reuse the unfiltered section's params when the page declares one
  // and share its cache entry, else fall back to a dedicated unfiltered fetch.
  const virtualListParams = useMemo(() => {
    const unfiltered = sections.find((s) => s.filter === undefined);
    return buildListParams({
      offset: unfiltered?.pageOffset ?? 0, limit: unfiltered?.pageLimit, locale,
    });
  }, [sections, locale]);

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
              placeholder={t("collections.searchRecords")}
              aria-label={t("collections.searchRecords")}
              style={searchInputStyle}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inscribed-search-clear"
                style={searchClearStyle}
                aria-label={t("collections.clear")}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <ListToolbar
          sort={sort}
          onSortChange={setSort}
          options={sortOptions}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
          locales={meta?.locales}
          locale={locale}
          // The open record belongs to the language being left, and its slug
          // addresses no row in the new one, so the pane goes with it.
          onLocaleChange={(next) => { setPickedLocale(next); setPane(null); }}
        />

        {supportsCreate && meta?.schema && !showArchived ? (
          <CreateButton
            collectionKey={collectionKey}
            listParams={virtualListParams}
            locale={locale}
            onOpen={() => setPane({ mode: "create" })}
          />
        ) : null}

        <div style={regionScrollStyle}>
          {/* The archive is its own view: a row that was never created has no
              place in it, and the backend sends no virtualItems there either. */}
          {showArchived ? null : (
            <DerivedRows
              collectionKey={collectionKey}
              listParams={virtualListParams}
              dirtySlugs={dirtySlugs}
              titleField={titleField}
              query={query}
              onOpenItem={(slug) => setPane({ mode: "edit", slug })}
            />
          )}

          {sections.length === 0 ? (
            <div style={emptyStateStyle}>
              {t("collections.noRegionBinding", { key: collectionKey })}
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
                sort={sort}
                archived={showArchived}
                locale={locale}
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
            slugSource={meta.slugSource}
            listParams={virtualListParams}
            translationOf={pane.translationOf}
            // A translation names its own target language; a plain new record
            // takes the one the panel is working in, which is how a first
            // English record gets written without a Turkish one to hang it on.
            locale={pane.locale ?? locale ?? undefined}
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

/**
 * Sort picker, language switch and archive toggle, in one strip under the
 * search box.
 *
 * The direction is a separate button rather than two entries per column: the
 * options come from the schema, so folding direction in would double a list
 * that already grows with the collection.
 *
 * @param {{
 *   sort: string,
 *   onSortChange: (next: string) => void,
 *   options: { value: string, labelKey?: string, label?: string }[],
 *   showArchived: boolean,
 *   onToggleArchived: () => void,
 *   locales: string[] | undefined,
 *   locale: string | null,
 *   onLocaleChange: (next: string) => void,
 * }} props
 */
function ListToolbar({
  sort, onSortChange, options, showArchived, onToggleArchived, locales, locale, onLocaleChange,
}) {
  const t = useCmsStrings();
  const [column, direction] = splitSort(sort);
  // One language is not a choice, and none at all means the collection isn't
  // localized: either way there is nothing to switch between.
  const showLocales = (locales?.length ?? 0) > 1;
  const ascending = direction === "asc";
  const directionLabel = ascending ? t("collections.sortAsc") : t("collections.sortDesc");

  const sortOptions = options.map((opt) => ({
    value: opt.value,
    label: opt.labelKey ? t(opt.labelKey) : (opt.label ?? opt.value),
  }));

  return (
    <div style={toolbarStyle}>
      <Menu
        value={column}
        options={sortOptions}
        onChange={(next) => onSortChange(`${next}:${direction}`)}
        label={t("collections.sortBy")}
      />

      <button
        type="button"
        onClick={() => onSortChange(`${column}:${ascending ? "desc" : "asc"}`)}
        className="inscribed-btn-ghost"
        style={toolbarButtonStyle}
        aria-label={directionLabel}
        title={directionLabel}
      >
        {/* Swapped, not rotated: a 180° flip passes through horizontal, where an
            arrow points at nothing and reads as a spinner. `mode="wait"` lets
            the old one collapse before the new one grows, so the two arrowheads
            never occupy the button at once. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={direction}
            style={directionIconStyle}
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.35, opacity: 0 }}
            transition={{ duration: 0.13, ease: PANEL_TRANSITION.ease }}
          >
            {ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </motion.span>
        </AnimatePresence>
      </button>

      <span style={{ flex: 1 }} />

      {showLocales ? <LocaleSwitch locales={locales} locale={locale} onChange={onLocaleChange} /> : null}

      <button
        type="button"
        onClick={onToggleArchived}
        className="inscribed-btn-ghost"
        style={{
          ...toolbarButtonStyle,
          ...(showArchived ? toolbarButtonOnStyle : null),
        }}
        aria-pressed={showArchived}
        title={t("collections.showArchive")}
      >
        <Archive size={13} />
      </button>
    </div>
  );
}

// Past this many languages the flat switch is wider than the space the toolbar
// has left, so it folds into a menu. Three fits beside the sort picker at the
// drawer's width; four does not.
const SEGMENTED_LOCALE_LIMIT = 3;

/**
 * Flat while the languages fit, a menu once they don't. Two codes are one tap
 * apart and that is worth keeping; eight would either wrap the toolbar onto a
 * second line or scroll sideways, and both are worse than one extra tap.
 *
 * @param {{ locales: string[], locale: string | null, onChange: (next: string) => void }} props
 */
function LocaleSwitch({ locales, locale, onChange }) {
  const t = useCmsStrings();

  if (locales.length > SEGMENTED_LOCALE_LIMIT) {
    return (
      <Menu
        value={locale ?? locales[0]}
        options={locales.map((code) => ({ value: code, label: code.toUpperCase() }))}
        onChange={onChange}
        label={t("collections.viewLocale")}
        triggerStyle={localeMenuTriggerStyle}
      />
    );
  }

  return (
    <div style={localeSwitchStyle} role="group" aria-label={t("collections.viewLocale")}>
      {locales.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className="inscribed-seg"
            title={t("collections.viewLocaleIs", { locale: code.toUpperCase() })}
            style={active ? { ...localeChipCurrentStyle, cursor: "pointer" } : localeSegStyle}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/**
 * `"publishedAt:desc"` into its two halves, defaulting the direction the way
 * the backend does.
 *
 * @param {string} sort
 * @returns {[string, "asc" | "desc"]}
 */
function splitSort(sort) {
  const [column, dir] = sort.split(":");
  return [column, dir === "desc" ? "desc" : "asc"];
}

/**
 * The caller's claim-derived slugs that have no record yet, as ordinary rows
 * opening the ordinary editor: the first save is what materialises them.
 *
 * Mounted once above the sections rather than inside each, because the server
 * returns the same `virtualItems` for every window: a page binding three
 * filtered regions would otherwise show each derived row three times.
 *
 * An archived slug arrives here too, flagged. It is the owner's only way to
 * learn their slug was taken down: the live list excludes archived rows, so
 * without this the row would sit in no default view at all. Opening it lands on
 * the detail pane's restore action rather than an editor.
 *
 * @param {{
 *   collectionKey: string,
 *   listParams: import("../shared/contracts/schemas.js").CollectionListParams,
 *   dirtySlugs: Set<string>,
 *   titleField: string | null,
 *   query: string,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
function DerivedRows({ collectionKey, listParams, dirtySlugs, titleField, query, onOpenItem }) {
  const { virtualItems } = useCollection(collectionKey, listParams);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return virtualItems.filter((row) => {
      if (row.origin !== "derived" || row.slug == null) return false;
      if (!q) return true;
      if (row.slug.toLowerCase().includes(q)) return true;
      const title = itemTitle(row, titleField);
      return title != null && title.toLowerCase().includes(q);
    });
  }, [virtualItems, query, titleField]);

  if (rows.length === 0) return null;

  return (
    <ul style={rowGroupStyle} data-cms-list>
      {rows.map((row) => (
        <li key={row.slug} style={{ listStyle: "none" }}>
          <RegionItemRow
            slug={/** @type {string} */ (row.slug)}
            title={itemTitle(row, titleField)}
            canEdit={row.canEdit}
            archived={row.isArchived === true}
            dirty={dirtySlugs.has(/** @type {string} */ (row.slug))}
            updatedAt={row.updatedAt}
            onOpen={() => onOpenItem(/** @type {string} */ (row.slug))}
          />
        </li>
      ))}
    </ul>
  );
}

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
 *   sort: string,
 *   archived: boolean,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
function RegionSection({
  collectionKey, filter, pageLimit, pageOffset, showHeader, dirtySlugs,
  titleField, query, sort, archived, locale, onOpenItem,
}) {
  const t = useCmsStrings();
  const initialLimit = pageLimit ?? DEFAULT_DRAWER_PAGE_SIZE;
  const initialOffset = pageOffset ?? 0;
  const [offset, setOffset] = useState(initialOffset);
  const [limit] = useState(initialLimit);

  // Anything that changes which rows come back, and in what order, has to
  // restart the accumulation: pages gathered under the old ordering would
  // otherwise interleave with pages under the new one.
  const windowKey = `${stableStringify(filter ?? null)}|${sort}|${archived}|${locale ?? ""}`;
  const [accumulated, setAccumulated] = useState(
    /** @type {import("../shared/contracts/schemas.js").CollectionItemResponse[]} */ ([]),
  );

  const params = useMemo(
    () => buildListParams({ filter, offset, limit, sort, archived, locale }),
    [filter, offset, limit, sort, archived, locale],
  );
  const { items, total, isLoading, error, refetch } = useCollection(collectionKey, params);

  useEffect(() => {
    setOffset(initialOffset);
    setAccumulated([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  useEffect(() => {
    if (isLoading || error) return;
    if (offset === initialOffset) {
      setAccumulated(items);
    } else {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((row) => row.slug));
        return [...prev, ...items.filter((row) => !seen.has(row.slug))];
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
          <span style={{ flex: 1 }}>{t("collections.listFailed", { message: error.message })}</span>
          <button
            type="button"
            onClick={refetch}
            className="inscribed-text-button"
            style={retryTextStyle}
          >
            {t("collections.retry")}
          </button>
        </div>
      ) : isLoading && accumulated.length === 0 ? (
        <div style={emptyStateStyle}>{t("collections.loading")}</div>
      ) : accumulated.length === 0 ? (
        <div style={emptyStateStyle}>
          {archived ? t("collections.archiveEmpty") : t("collections.noRecordsForFilter")}
        </div>
      ) : visible.length === 0 ? (
        <div style={emptyStateStyle}>
          {t("collections.searchEmpty", { query })}
        </div>
      ) : (
        <ul style={rowGroupStyle} data-cms-list>
          {visible.map((item) => (
            <li key={item.slug} style={{ listStyle: "none" }}>
              <RegionItemRow
                slug={item.slug}
                title={itemTitle(item, titleField)}
                canEdit={item.canEdit}
                archived={item.isArchived === true}
                dirty={dirtySlugs.has(item.slug)}
                updatedAt={item.updatedAt ?? item.createdAt}
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
          {t("collections.searchScope", { loaded: accumulated.length, remaining })}
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
          {isLoading ? t("collections.loading") : t("collections.loadMore", { remaining })}
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
  const t = useCmsStrings();
  const entries = filter ? Object.entries(filter) : [];
  return (
    <div style={regionHeaderStyle}>
      {entries.length === 0 ? (
        <span style={regionAllLabelStyle}>{t("collections.allRecords")}</span>
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
 * One collection item as a list row: the drawer's own row, with a record where
 * a block would be.
 *
 * The block list leads with the identifier and previews the value beside it;
 * this row swaps the two, because a block is looked up by its path and a record
 * is looked up by its title. The roles keep their families either way: prose in
 * the sans, the slug in the mono, in the same preview slot at the same size a
 * closed card gives its value.
 *
 * @param {{
 *   slug: string, title: string | null, canEdit: boolean, archived?: boolean,
 *   dirty: boolean, updatedAt?: string, onOpen: () => void,
 * }} props
 */
function RegionItemRow({ slug, title, canEdit, archived, dirty, updatedAt, onOpen }) {
  const t = useCmsStrings();
  // No title resolves when the schema has no textual field: the slug then takes
  // the lead and keeps its identifier styling instead of being dressed up as
  // prose, which also leaves the preview slot empty rather than printing the
  // same string twice.
  const headline = title ?? slug;
  const age = shortAge(updatedAt, t);
  // The row prints "3g"; hovering it says which day that was.
  const stamp = age && updatedAt ? new Date(updatedAt).toLocaleString() : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inscribed-region-row"
      style={rowStyle}
    >
      {/* Headline and dot are one cluster, not two siblings of the row: the
          headline is what grows into the row's slack, so a dot beside it in the
          row's own flow gets carried along to the far end and reads as the
          slug's. Inside the cluster the headline takes its own width and the
          dot sits against the last letter. */}
      <span style={rowLeadStyle}>
        <span style={title ? rowTitleStyle : rowSlugHeadlineStyle} title={headline}>
          {headline}
        </span>
        {dirty ? <span style={rowDotStyle} aria-label={t("block.unsavedDot")} /> : null}
      </span>

      {title ? (
        <span className="inscribed-row-slug" style={rowSlugStyle} title={slug}>{slug}</span>
      ) : null}

      {!canEdit ? <span style={readonlyChipStyle}>{t("block.readOnly")}</span> : null}
      {archived ? (
        <span style={archivedChipStyle}>{t("collections.archivedBadge")}</span>
      ) : null}

      {age ? (
        <span
          className="inscribed-row-age"
          style={rowAgeStyle}
          title={t("collections.editedAt", { when: stamp })}
        >
          {age}
        </span>
      ) : null}

      <span className="inscribed-list-chevron" style={rowChevronStyle} aria-hidden="true">
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
  const t = useCmsStrings();
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
          aria-label={t("collections.backToList")}
          title={t("collections.backToListTitle")}
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
  const t = useCmsStrings();
  const bySlug = useMemo(() => {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const entry of item?.translations ?? []) out.set(entry.locale, entry.slug);
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
            title={t("collections.addTranslation", { locale: label })}
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

const localeSwitchStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  gap: 2,
});

// The unselected halves of the segmented switch. Deliberately without a
// `background`: the hover fill is a class rule, and an inline background (even
// `transparent`) outranks it.
const localeSegStyle = /** @type {React.CSSProperties} */ ({
  font: `600 9px/1 ${FONT_SANS}`,
  letterSpacing: "0.05em",
  padding: "4px 7px",
  borderRadius: R_BADGE,
  border: 0,
  color: TEXT_MUTED,
  cursor: "pointer",
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
 * Detail pane for one collection row, persisted or claim-derived.
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
  const t = useCmsStrings();
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
          {editor.isArchived ? (
            <span style={archivedChipStyle}>{t("collections.archivedBadge")}</span>
          ) : null}
          {editor.item && !editor.canEdit ? (
            <span style={readonlyChipStyle}>{t("block.readOnly")}</span>
          ) : null}
          {editor.item ? (
            <span style={detailVersionStyle}>
              {editor.isVirtual ? t("collections.newBadge") : `v${editor.item.version}`}
            </span>
          ) : null}
        </>
      }
      // An archived row has one action, and it is not save: every write against
      // it answers 409 until someone restores it.
      footer={!editor.canEdit ? null : editor.isArchived ? (
        <>
          <span style={archiveNoticeStyle}>{t("collections.archivedNotice")}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={editor.restore}
            disabled={editor.isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            <ArchiveRestore size={13} />
            {t("collections.restore")}
          </button>
        </>
      ) : (
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
              aria-label={t("collections.undoRecord")}
              title={t("block.undo")}
            >
              <Undo2 size={13} />
            </button>
          ) : null}
          {/* Only a saved row can be archived; a virtual one has nothing to
              take down yet. */}
          {editor.isVirtual ? null : (
            <button
              type="button"
              onClick={editor.archive}
              disabled={editor.isPending}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label={t("collections.archiveRecord")}
              title={t("collections.archiveRecord")}
            >
              <Archive size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={editor.save}
            disabled={editor.isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {editor.isPending ? t("collections.saving") : t("status.save")}
          </button>
        </>
      )}
    >
      <CollectionRecordForm editor={editor} showMetaRow={false} showActions={false} />
    </DetailPane>
  );
}

// ---------------------------------------------------------------------------
// Create: pinned toolbar row (list layer) + create-mode detail pane (overlay)
// ---------------------------------------------------------------------------

/**
 * "+ Yeni" toolbar row. Lives inside the parallax list layer, so the create
 * pane itself renders separately in the panel's overlay slot; the two talk
 * through the shared list cache (the pending virtual row's `draftData` is the
 * stashed new-item draft).
 *
 * Names the language on a localized collection: the draft slot behind this row
 * is per locale, so the row says which one is about to be written before the
 * pane opens.
 *
 * @param {{
 *   collectionKey: string,
 *   listParams: import("../shared/contracts/schemas.js").CollectionListParams,
 *   locale: string | null,
 *   onOpen: () => void,
 * }} props
 */
function CreateButton({ collectionKey, listParams, locale, onOpen }) {
  const t = useCmsStrings();
  const { virtualItems } = useCollection(collectionKey, listParams);
  const hasServerDraft = virtualItems.some(
    (row) => row.origin === "pending" && row.draftData != null,
  );
  const label = locale
    ? t("collections.newRecordInLocale", { key: collectionKey, locale: locale.toUpperCase() })
    : t("collections.newRecordIn", { key: collectionKey });

  return (
    <div style={createBarStyle}>
      <button
        type="button"
        onClick={onOpen}
        className="inscribed-create-row"
        style={createButtonStyle}
      >
        <Plus size={13} />
        <span style={{ flex: 1 }}>{label}</span>
        {hasServerDraft ? <span style={draftBadgeStyle}>{t("collections.draftBadge")}</span> : null}
      </button>
    </div>
  );
}

/**
 * Create-mode detail pane. Mounts fresh per open: `useCollectionCreate` seeds
 * from the stashed backend draft (if any) and autosaves while mounted. Back
 * keeps the draft (autosaved); "Vazgeç" wipes it.
 *
 * A `UserDefined` collection also gets a slug input. The field is the only
 * thing that differs: the draft slot, its seeding and its autosave are the same
 * ones an AutoGenerated collection uses, and only the publish request splits.
 *
 * @param {{
 *   collectionKey: string,
 *   schema: import("../shared/contracts/schemas.js").CollectionSchema,
 *   slugSource: import("../shared/contracts/schemas.js").CollectionSlugSource,
 *   listParams: import("../shared/contracts/schemas.js").CollectionListParams,
 *   translationOf?: string,
 *   locale?: string,
 *   onClose: () => void,
 * }} props
 */
function CreatePane({ collectionKey, schema, slugSource, listParams, translationOf, locale, onClose }) {
  const t = useCmsStrings();
  // A page-level <CollectionComposer> may be open on the same collection, and
  // both would write its single new-item slot; the first to claim it wins.
  const scopeId = useId();
  const isDraftWriter = useCreateDraftRole(collectionKey, scopeId);
  // Lives here rather than in the hook: the backend's new-item draft slot has
  // no room for a slug, so this is the only copy and it dies with the pane.
  const [slug, setSlug] = useState("");
  const needsSlug = slugSource === "UserDefined";
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
    // Share the page's list window so the pending-row lookup hits the cache
    // instead of a separate GET.
    listParams,
    active: isDraftWriter,
    translationOf,
    locale,
    slug,
  });

  return (
    <DetailPane
      onBack={onClose}
      // Named whenever there is a language at all, not only for translations:
      // on a localized collection the whole point is knowing which one you are
      // composing in.
      title={locale
        ? t("collections.newRecordInLocale", { key: collectionKey, locale: locale.toUpperCase() })
        : t("collections.newRecordIn", { key: collectionKey })}
      meta={hasServerDraft ? <span style={draftBadgeStyle}>{t("collections.draftBadge")}</span> : null}
      footer={
        <>
          <button
            type="button"
            onClick={() => { deleteDraft(); onClose(); }}
            disabled={isPending}
            className="inscribed-btn-ghost"
            style={btnGhostStyle}
          >
            {t("status.discard")}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => submit(onClose)}
            disabled={isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {isPending ? t("collections.creating") : t("collections.create")}
          </button>
        </>
      }
    >
      <div style={createFormWrapStyle}>
        {needsSlug ? (
          <SlugField value={slug} onChange={setSlug} disabled={isPending} />
        ) : null}
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

// Sentence case, matching the collections list's section headings: the drawer
// has one voice for labelling a group of rows, and it isn't tracked-out
// micro-caps.
const regionAllLabelStyle = /** @type {React.CSSProperties} */ ({
  font: `500 11px/1 ${FONT_SANS}`,
  letterSpacing: "-0.005em",
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

// No box around the list and no rules between the rows: the drawer groups by
// spacing and rounded fills, never by frames. A bordered group with dividers is
// a table, and it read as one imported from somewhere else.
//
// The rows start at the panel's own 16px inset, same as the search field, the
// toolbar and the section header above them. A row's rounded edge is what has
// to land on that line; its text then sits further in, exactly as a block card
// does on the Page tab.
const rowGroupStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
  padding: "0 16px",
});

// One control height for the whole drawer: a ShortText input is 12px of text in
// 9px of padding, and the collections list a level up is the same 32px box.
// `boxSizing` is required, not tidiness: nothing resets it in the panel, so
// under content-box the min-height would stack on top of the padding.
const rowStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 32,
  padding: "6px 12px",
  border: 0,
  borderRadius: R_MD,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

// Beside the chevron, where every other row in the drawer keeps it, rather than
// in a reserved slot off the left edge.
const rowDotStyle = /** @type {React.CSSProperties} */ ({
  ...dirtyDotStyle,
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
});

// Holds the row's slack, so everything after it lands in the right lane.
const rowLeadStyle = /** @type {React.CSSProperties} */ ({
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
});

// The lead: prose (a field value), so the sans, one tone above the block path
// it stands in for because a title is what the eye is actually hunting. Sized
// from its own text, so the dot beside it stays against the text rather than
// against the far edge of a box that grew.
const rowTitleStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  font: `500 11px/1.2 ${FONT_SANS}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Fallback lead: an identifier now, so it is the block path's own style, with
// the same basis override the title above takes.
const rowSlugHeadlineStyle = /** @type {React.CSSProperties} */ ({
  ...rowPathStyle,
  flex: "0 1 auto",
});

// The preview slot, on a closed block card's terms: yields to the lead, never
// takes more than the row's back half. Colour lives on `.inscribed-row-slug` so
// the row's hover rule can lift it; an inline colour would outrank it.
const rowSlugStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  maxWidth: "45%",
  font: `11px/1.2 ${FONT_MONO}`,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Right edge of the row. Tabular figures plus a floor width and right
// alignment: without both, "5 dk" and "12.08.2026" start in different places
// and the column the ages are supposed to form never appears. Colour is on
// `.inscribed-row-age`, same reason as the slug above.
const rowAgeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  minWidth: 30,
  textAlign: "right",
  font: `500 10px/1 ${FONT_SANS}`,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const searchBarStyle = /** @type {React.CSSProperties} */ ({
  padding: "10px 16px 6px",
  flexShrink: 0,
});

// `position: relative` anchors the sort menu. The toolbar sits outside the
// list's scroll box, so the panel can hang past it without being clipped.
const toolbarStyle = /** @type {React.CSSProperties} */ ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 16px 8px",
  flexShrink: 0,
});

// A two-letter code is a short label, so it gets the tracking the segmented
// chips use rather than reading as a cramped word.
const localeMenuTriggerStyle = /** @type {React.CSSProperties} */ ({
  letterSpacing: "0.04em",
});

// Centres the arrow while it is mid-swap, when its own box is scaled down.
const directionIconStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

// No inline `border`, `background` or `color`: the frame and both hover states
// come from `.inscribed-btn-ghost`, and an inline value of any of the three
// outranks the class, which is what left these two buttons inert on hover. The
// dropped border is also what puts them at the menu trigger's 24px rather than
// 26px, so the strip finally lines up.
const toolbarButtonStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  border: 0,
  borderRadius: R_SM,
  cursor: "pointer",
});

const toolbarButtonOnStyle = /** @type {React.CSSProperties} */ ({
  background: COLLECTION_SOFT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
  color: COLLECTION_ACCENT,
});

const searchScopeNoteStyle = /** @type {React.CSSProperties} */ ({
  padding: "2px 16px 0",
  font: `10.5px/1.4 ${FONT_SANS}`,
  color: TEXT_MUTED,
});

const rowChevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: TEXT_FAINT,
  flexShrink: 0,
});

// One recipe for every state tag a record wears, in the row and in the detail
// header alike: the create lane's draft badge, minus its tint. They used to be
// two hand-rolled boxes at a radius (3) that exists nowhere else in the scale.
const stateChipStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  font: `600 9px/1 ${FONT_SANS}`,
  letterSpacing: "0.045em",
  textTransform: "uppercase",
  padding: "3px 5px",
  borderRadius: R_BADGE,
});

const readonlyChipStyle = /** @type {React.CSSProperties} */ ({
  ...stateChipStyle,
  background: SURFACE_1,
  color: TEXT_MUTED,
});

// A tinted fill rather than red lettering on the neutral one: archived is a
// state, not an error, and the old pairing put the loudest colour in the row on
// its quietest surface.
const archivedChipStyle = /** @type {React.CSSProperties} */ ({
  ...stateChipStyle,
  background: `color-mix(in srgb, ${STATUS_DANGER} 12%, transparent)`,
  color: STATUS_DANGER,
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

const archiveNoticeStyle = /** @type {React.CSSProperties} */ ({
  font: `11px/1.4 ${FONT_SANS}`,
  color: TEXT_MUTED,
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
