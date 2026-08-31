"use client";

/**
 * @file The row lists inside one collection panel: `RegionSection` (one
 * `<CollectionRegion>` binding's own window, with its filter header and its
 * "Load more") and `DerivedRows` (claim-derived slugs that have no record yet).
 *
 * They are one module because they are the same list twice: both turn a window
 * of the shared cache into `RegionItemRow`s, and both filter it by the panel's
 * search over the loaded rows only.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { buildListParams } from "../../collections/params.js";
import { useCollection } from "../../collections/hooks/use-collection.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";
import { itemImage, itemTitle } from "./collection-format.js";

import { RegionItemRow } from "./RegionItemRow.jsx";
import { SkeletonRows } from "../Skeleton.jsx";
import { emptyStateStyle } from "../../editors/styles.js";
import {
  listArrival,
  sectionWrapStyle, rowGroupStyle, searchScopeNoteStyle, errorBoxStyle,
  retryTextStyle, loadMoreStyle, regionHeaderStyle, regionAllLabelStyle,
  filterChipStyle, filterChipKeyStyle, filterChipValueStyle, regionCountStyle,
} from "./collection-styles.js";

const DEFAULT_DRAWER_PAGE_SIZE = 50;

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
 *   listParams: import("../../shared/contracts/schemas.js").CollectionListParams,
 *   dirtySlugs: Set<string>,
 *   activeSlug: string | null,
 *   imageField: string | null,
 *   titleField: string | null,
 *   query: string,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
export function DerivedRows({
  collectionKey, listParams, dirtySlugs, activeSlug, titleField, imageField, query, onOpenItem,
}) {
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
            isActive={row.slug === activeSlug}
            image={itemImage(row, imageField)}
            showThumb={imageField != null}
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
 *   activeSlug: string | null,
 *   imageField: string | null,
 *   sort: string,
 *   archived: boolean,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
export function RegionSection({
  collectionKey, filter, pageLimit, pageOffset, showHeader, dirtySlugs, activeSlug,
  titleField, imageField, query, sort, archived, locale, onOpenItem,
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
    /** @type {import("../../shared/contracts/schemas.js").CollectionItemResponse[]} */ ([]),
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

  // Which of the five bodies the section is showing. Named rather than left as
  // a chain of ternaries because the cross-fade above keys off it: the identity
  // of the branch is what has to change for the list to swap, and a chain gives
  // that no name to key on.
  const branch = error
    ? "error"
    : isLoading && accumulated.length === 0
      ? "loading"
      : accumulated.length === 0
        ? "empty"
        : visible.length === 0
          ? "searchEmpty"
          : "rows";

  // The window, not just the branch. Switching language (or the archive, or the
  // sort) replaces every row with different content, and when the new window is
  // already cached the branch never leaves "rows", so the list would swap
  // silently. Search is deliberately not in here: it narrows the same list a
  // letter at a time, and re-landing it on every keystroke would fight the
  // immediacy that makes typing feel like filtering rather than navigating.
  const arrivalKey = branch === "rows" ? `rows:${windowKey}` : branch;

  return (
    <div style={sectionWrapStyle}>
      {showHeader ? (
        <RegionHeader filter={filter} loaded={accumulated.length} total={total} />
      ) : null}

      {/* Keyed on which of the five the section is showing, never on what is
          inside one: appending a page of rows, or filtering them, must not
          replay the arrival. `mode="wait"` so the two never overlap, which for
          a skeleton standing in for the very rows arriving would read as the
          list arriving twice. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={arrivalKey} {...listArrival(branch === "rows")}>
          {branch === "error" ? (
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
          ) : branch === "loading" ? (
            // Same geometry as the rows arriving: 50px, two lines, and
            // the lead this collection actually has.
            <SkeletonRows
              count={6}
              lines={2}
              height={50}
              gap={11}
              lead={imageField ? "thumb" : "mark"}
            />
          ) : branch === "empty" ? (
            <div style={emptyStateStyle}>
              {archived ? t("collections.archiveEmpty") : t("collections.noRecordsForFilter")}
            </div>
          ) : branch === "searchEmpty" ? (
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
                    isActive={item.slug === activeSlug}
                image={itemImage(item, imageField)}
                showThumb={imageField != null}
                    updatedAt={item.updatedAt ?? item.createdAt}
                    onOpen={() => onOpenItem(item.slug)}
                  />
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>

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
