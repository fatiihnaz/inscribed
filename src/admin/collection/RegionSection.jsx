"use client";

/**
 * @file The row lists inside one collection panel: `RegionSection` (one
 * `<CollectionRegion>` binding's own window, with its filter header and its
 * "Load more") and `DerivedRows` (claim-derived slugs that have no record yet).
 *
 * They are one module because they are the same list twice: both turn a window
 * of the shared cache into `RegionItemRow`s under the panel's search. A section
 * asks the backend for its matches; derived rows arrive whole in every window,
 * so they are narrowed here by the same rule.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { buildListParams } from "../../collections/params.js";
import { useCollection } from "../../collections/hooks/use-collection.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";
import { itemImage, itemTitle, matchesSearch, searchTerms } from "./collection-format.js";

import { RegionItemRow } from "./RegionItemRow.jsx";
import { SkeletonRows } from "../Skeleton.jsx";
import { emptyStateStyle } from "../../editors/styles.js";
import {
  listArrival,
  sectionWrapStyle, rowGroupStyle, listSettledStyle, listStaleStyle, searchNoteStyle,
  errorBoxStyle, retryTextStyle, loadMoreStyle, regionHeaderStyle, regionAllLabelStyle,
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
 *   search: string,
 *   onOpenItem: (slug: string) => void,
 * }} props
 */
export function DerivedRows({
  collectionKey, listParams, dirtySlugs, activeSlug, titleField, imageField, search, onOpenItem,
}) {
  const { virtualItems } = useCollection(collectionKey, listParams);
  const terms = useMemo(() => searchTerms(search), [search]);

  const rows = useMemo(
    () => virtualItems.filter((row) => row.origin === "derived" && row.slug != null
      && matchesSearch([row.slug, itemTitle(row, titleField)], terms)),
    [virtualItems, terms, titleField],
  );

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
            highlight={terms}
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
 *   titleField: string | null,
 *   imageField: string | null,
 *   search: string,
 *   sort: string,
 *   archived: boolean,
 *   locale: string | null,
 *   onOpenItem: (slug: string) => void,
 * }} props
 *   `search` is the panel's search box once typing has paused, trimmed: every
 *   value it takes is a request.
 */
export function RegionSection({
  collectionKey, filter, pageLimit, pageOffset, showHeader, dirtySlugs, activeSlug,
  titleField, imageField, search, sort, archived, locale, onOpenItem,
}) {
  const t = useCmsStrings();
  const initialOffset = pageOffset ?? 0;
  const [limit] = useState(pageLimit ?? DEFAULT_DRAWER_PAGE_SIZE);

  // Anything that changes which rows come back, and in what order, has to
  // restart the accumulation: pages gathered under the old ordering would
  // otherwise interleave with pages under the new one. The search restarts it
  // too, but is kept out of this key because it restarts differently: a new
  // window starts from a skeleton, a new search keeps the last answer up until
  // the next one lands.
  const windowKey = `${stableStringify(filter ?? null)}|${sort}|${archived}|${locale ?? ""}`;

  // Pages past the first, counted for one window and search and ignored under
  // any other. Resetting them in an effect instead would run a render late, and
  // that render would fetch the new search at the old offset.
  const pagingKey = `${windowKey}|${search}`;
  const [extra, setExtra] = useState({ key: pagingKey, pages: 0 });
  const pages = extra.key === pagingKey ? extra.pages : 0;
  const offset = initialOffset + pages * limit;

  const params = useMemo(
    () => buildListParams({ filter, offset, limit, sort, archived, locale, q: search }),
    [filter, offset, limit, sort, archived, locale, search],
  );
  const { items, total, approximate, isLoading, error, refetch } = useCollection(collectionKey, params);

  // The rows on screen and the question they answer, tagged rather than reset,
  // so a search in flight can leave the previous answer showing. The question
  // is null until the first answer lands.
  const [shown, setShown] = useState({
    windowKey: /** @type {string | null} */ (null),
    search: /** @type {string | null} */ (null),
    total: 0,
    approximate: false,
    items: /** @type {import("../../shared/contracts/schemas.js").CollectionItemResponse[]} */ ([]),
  });

  useEffect(() => {
    if (isLoading || error) return;
    setShown((prev) => {
      if (offset === initialOffset || prev.windowKey !== windowKey || prev.search !== search) {
        return { windowKey, search, total, approximate, items };
      }
      const seen = new Set(prev.items.map((row) => row.slug));
      return { ...prev, total, items: [...prev.items, ...items.filter((row) => !seen.has(row.slug))] };
    });
  }, [items, total, approximate, isLoading, error, offset, initialOffset, windowKey, search]);

  const current = shown.windowKey === windowKey && shown.search === search;
  // The same window under another search: its rows stay, dimmed, until the
  // answer arrives. A different window has nothing worth keeping.
  const stale = !current && shown.windowKey === windowKey;
  const answer = current || stale ? shown : null;
  const accumulated = answer?.items ?? [];
  const answerTotal = answer?.total ?? 0;

  const canLoadMore = current && accumulated.length < answerTotal;
  const loadMore = () => setExtra({ key: pagingKey, pages: pages + 1 });
  const remaining = Math.max(0, answerTotal - accumulated.length);
  // Near misses are there because the words do not occur in them, so there is
  // nothing to mark.
  const highlight = useMemo(
    () => (shown.approximate || !shown.search ? undefined : searchTerms(shown.search)),
    [shown.approximate, shown.search],
  );

  // Which of the five bodies the section is showing. Named rather than left as
  // a chain of ternaries because the cross-fade above keys off it: the identity
  // of the branch is what has to change for the list to swap, and a chain gives
  // that no name to key on.
  const branch = error
    ? "error"
    : accumulated.length === 0 && (isLoading || !current)
      ? "loading"
      : accumulated.length === 0
        ? search ? "searchEmpty" : "empty"
        : "rows";

  // The window, not just the branch. Switching language (or the archive, or the
  // sort) replaces every row with different content, and when the new window is
  // already cached the branch never leaves "rows", so the list would swap
  // silently. Search is deliberately not in here: a new answer takes the place
  // of the dimmed one, and landing the whole list again at every pause in
  // typing would make searching feel like navigating away.
  const arrivalKey = branch === "rows" ? `rows:${windowKey}` : branch;

  return (
    <div style={sectionWrapStyle}>
      {showHeader ? (
        <RegionHeader filter={filter} loaded={accumulated.length} total={answerTotal} />
      ) : null}

      {current && shown.approximate && accumulated.length > 0 ? (
        <div style={searchNoteStyle}>{t("collections.searchApproximate")}</div>
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
              {t("collections.searchEmpty", { query: search })}
            </div>
          ) : (
            <ul
              style={{ ...rowGroupStyle, ...(stale ? listStaleStyle : listSettledStyle) }}
              aria-busy={stale || undefined}
              data-cms-list
            >
              {accumulated.map((item) => (
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
                    highlight={highlight}
                    updatedAt={item.updatedAt ?? item.createdAt}
                    onOpen={() => onOpenItem(item.slug)}
                  />
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>

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
