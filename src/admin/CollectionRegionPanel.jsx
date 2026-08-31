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
 *
 * Only the orchestration is here: which sections exist, which pane is open, and
 * what the panel is sorted and localized by. The surfaces it composes live in
 * `./collection/`, and this module stays at its old path so the drawer's
 * `next/dynamic` import still names the chunk boundary.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "../shared/style/icons.jsx";

import { collectionItemBindingId, useCollectionContext } from "../collections/context.js";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyRecords, dirtySlugsFor } from "./dirty.js";
import { buildListParams, DEFAULT_SORT } from "../collections/params.js";
import { useCollectionMeta } from "../collections/hooks/use-my-collections.js";
import { useCollectionLocale } from "../collections/hooks/use-collection-locale.js";
import { stableStringify } from "../shared/util/stable-stringify.js";

import { titleFieldName, imageFieldName, sortableColumns } from "./collection/collection-format.js";
import { ListToolbar } from "./collection/ListToolbar.jsx";
import { DerivedRows, RegionSection } from "./collection/RegionSection.jsx";
import { ItemDetailPane } from "./collection/ItemDetailPane.jsx";
import { CreateButton, CreatePane } from "./collection/CreatePane.jsx";
import {
  PANE_TRANSITION, PARALLAX_SHIFT, listLayerStyle, regionScrollStyle, searchBarStyle,
} from "./collection/collection-styles.js";

import { emptyStateStyle } from "../editors/styles.js";
import { paneStyle, searchWrapStyle, searchInputStyle, searchClearStyle } from "./drawer-styles.js";
import { TEXT_FAINT } from "../shared/style/tokens.js";

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


/**
 * @param {{
 *   collectionKey: string,
 *   scope?: "page" | "global",
 *   panelId?: string,
 *   labelledBy?: string,
 * }} props
 *   `panelId` / `labelledBy` bind the pane to the collection switcher above it
 *   when one is present.
 */
export function CollectionRegionPanel({ collectionKey, scope = "page", panelId, labelledBy }) {
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
  // Null for a collection that declares no image, which is what drops the
  // thumbnail column entirely rather than lining every row up behind an empty
  // one.
  const imageField = useMemo(() => imageFieldName(meta?.schema), [meta]);
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

  // Which row the page's own selection points at, read once here for the same
  // reason `dirtySlugs` is: a list of fifty rows should not hold fifty store
  // subscriptions. Collection bindings share the drawer's single `activeBlock`
  // channel with content blocks, so the id is matched by the prefix its own
  // builder produces rather than by a format spelled out a second time.
  const { uiStore } = useCmsContext();
  const activeBlock = useStoreSelector(uiStore, (s) => s.activeBlock);
  const activeSlug = useMemo(() => {
    const prefix = collectionItemBindingId(collectionKey, "");
    return activeBlock?.startsWith(prefix) ? activeBlock.slice(prefix.length) : null;
  }, [activeBlock, collectionKey]);

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
    <section
      style={{ ...paneStyle, position: "relative", overflow: "hidden" }}
      id={panelId}
      role={panelId ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
    >
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
              activeSlug={activeSlug}
              titleField={titleField}
              imageField={imageField}
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
                activeSlug={activeSlug}
                titleField={titleField}
                imageField={imageField}
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
