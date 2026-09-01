"use client";

/**
 * @file Collections mode landing surface: every collection the user can reach
 * (per `/me`), not just the ones this page binds. Picking one hands off to
 * `<CollectionRegionPanel scope="global">`.
 *
 * Each row says everything `/me` knows about a collection without opening it:
 * what a record in there is made of, how many fields that is, which languages
 * it holds, whether the current page binds it, whether it can take new records
 * and whether it has unsaved work. It's the only screen where a collection can
 * be compared against its neighbours, so it carries the comparison.
 */

import { Fragment, memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Lock, Search } from "../shared/style/icons.jsx";

import { useCollectionContext } from "../collections/context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyRecords, dirtyCollectionKeys } from "./dirty.js";
import { useMyCollections } from "../collections/hooks/use-my-collections.js";
import { useCollection } from "../collections/hooks/use-collection.js";
import { buildListParams } from "../collections/params.js";

import { SkeletonRows } from "./Skeleton.jsx";
import { emptyStateStyle } from "../editors/styles.js";
import { listArrival } from "./collection/collection-styles.js";
import { paneStyle, toolbarStyle, searchWrapStyle, searchInputStyle, searchClearStyle, listStyle, dirtyDotStyle } from "./drawer-styles.js";
import { TEXT_HI, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, COLLECTION_SOFT, HAIRLINE, FONT_SANS, R_MD, R_BADGE, dynamicSize } from "../shared/style/tokens.js";

/**
 * Memoised: it stays mounted (and animating) underneath an open collection, so
 * it must not re-render just because the drawer above it did. Its own store
 * subscriptions still refresh it when collection state actually changes.
 *
 * @param {{ onSelect: (collectionKey: string) => void }} props
 */
export const CollectionsPane = memo(function CollectionsPane({ onSelect }) {
  const t = useCmsStrings();
  const { collectionStore } = useCollectionContext();
  const { collections, isLoading } = useMyCollections();
  const [search, setSearch] = useState("");

  const drafts = useStoreSelector(collectionStore, (s) => s.drafts);
  const itemCache = useStoreSelector(collectionStore, (s) => s.itemCache);
  const collectionBindings = useStoreSelector(collectionStore, (s) => s.bindings);

  // Per-collection dirty, unioning live overlay drafts with cached items that
  // carry a server draft. Same two-source union the drawer's dirty dots use:
  // the overlay clears once autosave lands, which would otherwise drop the mark.
  const dirtyKeys = useMemo(
    () => dirtyCollectionKeys(collectDirtyRecords(drafts, itemCache)),
    [drafts, itemCache],
  );

  const boundKeys = useMemo(() => {
    /** @type {Set<string>} */
    const set = new Set();
    for (const [, binding] of collectionBindings) set.add(binding.collection);
    return set;
  }, [collectionBindings]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? collections.filter((c) => c.collectionKey.toLowerCase().includes(q))
      : collections;
    return [...filtered].sort((a, b) => a.collectionKey.localeCompare(b.collectionKey));
  }, [collections, search]);

  // What this page binds, then everything else. Sorting the bound ones to the
  // top said the same thing, but only to someone who already knew the rule was
  // there; a heading says it outright, and it also gives the eye somewhere to
  // stop in a list that is otherwise one unbroken column of slugs.
  const groups = useMemo(() => {
    /** @type {typeof visible} */ const onPage = [];
    /** @type {typeof visible} */ const rest = [];
    for (const c of visible) (boundKeys.has(c.collectionKey) ? onPage : rest).push(c);
    // With nothing bound, a lone "other collections" would be labelling the
    // whole list against nothing.
    if (onPage.length === 0) return [{ labelKey: null, items: rest }];
    return [
      { labelKey: "collections.sectionOnPage", items: onPage },
      ...(rest.length ? [{ labelKey: "collections.sectionOther", items: rest }] : []),
    ];
  }, [visible, boundKeys]);

  // Which of the three the pane is showing. Named so the arrival below can key
  // off it: a chain of ternaries gives it nothing to key on.
  const branch = isLoading && visible.length === 0
    ? "loading"
    : visible.length === 0
      ? "empty"
      : "rows";

  return (
    <section style={paneStyle}>
      {collections.length > 0 ? (
        <div style={toolbarStyle}>
          <div className="inscribed-search" style={searchWrapStyle}>
            <Search size={13} color={TEXT_FAINT} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("collections.searchCollections")}
              aria-label={t("collections.searchCollections")}
              style={searchInputStyle}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="inscribed-search-clear"
                style={searchClearStyle}
                aria-label={t("collections.clear")}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Same arrival the record list uses, keyed on the branch rather than on
          the rows: typing in the search box filters the list, it does not make
          it land again. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={branch} {...listArrival(branch === "rows")}>
          {branch === "loading" ? (
            <SkeletonRows count={5} lines={2} height={44} />
          ) : branch === "empty" ? (
            <div style={emptyStateStyle}>
              {search
                ? t("collections.noSearchResults", { query: search })
                : t("collections.noneAccessible")}
            </div>
          ) : (
            <ul className="inscribed-collection-list" style={collectionListStyle} data-cms-list>
              {groups.map((group) => (
                <Fragment key={group.labelKey ?? "all"}>
                  {group.labelKey ? (
                    <li style={groupLabelStyle}>
                      {t(group.labelKey)}
                      <span style={groupCountStyle}>{group.items.length}</span>
                      <span style={groupRuleStyle} aria-hidden="true" />
                    </li>
                  ) : null}
                  {group.items.map((c) => (
                    <li key={c.collectionKey} style={{ listStyle: "none" }}>
                      <CollectionRow
                        collectionKey={c.collectionKey}
                        displayName={c.displayName}
                        fields={c.schema?.fields}
                        locales={c.locales}
                        canCreate={Boolean(c.canCreate)}
                        onPage={boundKeys.has(c.collectionKey)}
                        dirty={dirtyKeys.has(c.collectionKey)}
                        onOpen={() => onSelect(c.collectionKey)}
                      />
                    </li>
                  ))}
                </Fragment>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
});

/**
 * How many records a collection holds.
 *
 * `/me` carries no count and the list endpoint's `total` is the only place one
 * exists, so this asks for a single row and reads the total off the envelope.
 * One request per collection, which is what the answer costs: this screen is a
 * handful of rows, not a feed.
 *
 * Its own component rather than a hook up in the row, so one collection's
 * request settling re-renders one number instead of the whole list. It draws
 * nothing until the count lands: a zero that becomes forty-eight is worse than
 * a beat of nothing, because a wrong number is one somebody may act on.
 *
 * @param {{ collectionKey: string }} props
 */
function RecordCount({ collectionKey }) {
  const t = useCmsStrings();
  // One row is enough to be told how many there are, and the least the endpoint
  // will answer with.
  const params = useMemo(() => buildListParams({ limit: 1 }), []);
  const { total, isLoading, error } = useCollection(collectionKey, params);

  if (isLoading || error) return null;

  // A bare number, and vertically centred rather than stacked. The label used to
  // sit under it, which put the two halves of one fact on the row's two
  // different text lines, and printed the same word down every row: a legend
  // repeated once per entry is not a legend. What it counts rides in the
  // tooltip, where it costs nothing.
  return (
    <span style={countBoxStyle} title={t("collections.recordCount", { count: total })}>
      <span style={countNumberStyle}>{total}</span>
      <span style={countLabelStyle}>{t("collections.recordsLabel")}</span>
    </span>
  );
}

// Enough of the shape to recognise a collection by, not the whole schema. The
// count beside it says how much was left out.
const SHAPE_FIELDS = 3;

/**
 * @param {import("../shared/contracts/schemas.js").CollectionFieldDescriptor[]} fields
 */
function shapeOf(fields) {
  return fields
    .slice(0, SHAPE_FIELDS)
    .map((f) => f.label || f.name)
    .join(" · ");
}

/**
 * One collection, over two lines, with its record count opposite.
 *
 * Line one is what it is: the name, and whether this page binds it. Line two is
 * what addresses it and what a record in it is made of, in that order, because
 * the address is the smaller fact and the shape is what tells two collections
 * apart at a glance.
 *
 * The name is the collection's own `displayName` where it has one and its key
 * where it does not. The key is a literal identifier, so on the fallback path
 * the headline is set in the identifier's family; a real name is prose and gets
 * the sans.
 *
 * The page binding is a word rather than a tint on a glyph. The glyph it
 * replaced marked nothing (every row here is a collection) and its colour asked
 * the reader to already know the rule.
 *
 * @param {{
 *   collectionKey: string,
 *   displayName?: string,
 *   fields: import("../shared/contracts/schemas.js").CollectionFieldDescriptor[] | undefined,
 *   locales: string[] | undefined,
 *   canCreate: boolean,
 *   onPage: boolean,
 *   dirty: boolean,
 *   onOpen: () => void,
 * }} props
 */
function CollectionRow({
  collectionKey, displayName, fields, locales, canCreate, onPage, dirty, onOpen,
}) {
  const t = useCmsStrings();
  const shape = fields?.length ? shapeOf(fields) : "";
  const named = Boolean(displayName);
  // A single language is the site's own default, so naming it says nothing. The
  // marker earns its place only where the collection actually holds more.
  const languages = locales && locales.length > 1
    ? locales.map((l) => l.toUpperCase()).join(" ")
    : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inscribed-listrow"
      style={rowStyle}
    >
      <span style={textColStyle}>
        <span style={identityLineStyle}>
          <span style={named ? nameStyle : keyHeadlineStyle} title={collectionKey}>
            {displayName ?? collectionKey}
          </span>
          {onPage ? <span style={onPageBadgeStyle}>{t("collections.sectionOnPage")}</span> : null}
          {/* Against the name, not out at the chevron: the draft belongs to this
              collection, and a dot alone on the far edge read as a row-level
              status light with nothing to attach it to. */}
          {dirty ? (
            <span style={collectionDotStyle} aria-label={t("block.unsavedDot")} />
          ) : null}
        </span>

        <span style={propertyLineStyle}>
          {/* Only where the name above is not already the key. */}
          {named ? <span style={keyStyle} title={collectionKey}>{collectionKey}</span> : null}
          {named && shape ? <span style={sepStyle} aria-hidden="true">·</span> : null}
          {shape ? <span style={shapeStyle} title={shape}>{shape}</span> : null}
          {languages ? <span style={localeStyle}>{languages}</span> : null}
          {/* Most collections take new records, so the flag is worth showing
              only where it is missing. */}
          {!canCreate ? (
            <span style={lockStyle} title={t("collections.createForbidden")}>
              <Lock size={11} />
            </span>
          ) : null}
        </span>
      </span>

      {/* The first thing anyone wants to know before opening one, and the one
          thing this screen could not say. */}
      <RecordCount collectionKey={collectionKey} />

      <span className="inscribed-list-chevron" style={chevronStyle} aria-hidden="true">
        <ChevronRight size={13} />
      </span>
    </button>
  );
}

// Wider than the record list's 2px, narrower than the block list's 10px: two
// stacked lines inside a row need more than a hairline of air around them to
// keep reading as one row, but these still don't open into anything.
const collectionListStyle = /** @type {React.CSSProperties} */ ({
  ...listStyle,
  gap: 4,
});

// A headline over a property line, with a figure opposite. A grid rather than a
// flex row: the count and the chevron hold their own tracks, so a long name
// cannot push either of them out of the column they form down the list.
const rowStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 12px",
  border: 0,
  borderRadius: R_MD,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

const textColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

const identityLineStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
});

// Line two. The shape yields, the counts and codes hold: a truncated field list
// still says what kind of thing this is, a truncated "6 fields" says nothing.
const propertyLineStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  color: TEXT_MUTED,
});

// The collection's own name. Prose, so the sans, and the one thing on this row
// set at a heading's size: it is what the eye lands on, and what holds the other
// side of the line against the count opposite.
const nameStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(13.5),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.01em",
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// The fallback headline, where the collection named itself nothing. Same size
// as a real name, just without the tightened tracking.
const keyHeadlineStyle = /** @type {React.CSSProperties} */ ({
  ...nameStyle,
  letterSpacing: 0,
});

// The address, on line two beside the shape. Only rendered where the headline
// above is a name rather than this same key.
const keyStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  maxWidth: "40%",
  fontFamily: FONT_SANS,
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const sepStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  color: TEXT_FAINT,
});

// The page binding, said in the words the section heading uses. It replaces a
// tinted glyph: a colour alone asked the reader to already know the rule, and
// the glyph itself marked nothing, since every row here is a collection.
const onPageBadgeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  fontWeight: 600,
  fontSize: dynamicSize(9),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "0.02em",
  padding: "3px 6px",
  borderRadius: R_BADGE,
  color: COLLECTION_ACCENT,
  background: COLLECTION_SOFT,
});

// Sentence case at the panel's own size, not tracked-out micro-caps. The drawer
// speaks in sentence case everywhere else (its buttons, its empty states, its
// menus), and 10px uppercase with wide tracking is a badge wearing a heading's
// job.
const groupLabelStyle = /** @type {React.CSSProperties} */ ({
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 12px 6px",
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  color: TEXT_MUTED,
});

// How many collections are under this heading. Beside the label rather than at
// the far edge: it belongs to the heading, and out on the right it read as a
// column header for the record counts below it.
const groupCountStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(10.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  color: TEXT_FAINT,
});

// Runs from the heading out to the panel's edge, which is what makes the label
// read as opening a section rather than as one more row in the list.
const groupRuleStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  height: 1,
  background: HAIRLINE,
});

const collectionDotStyle = /** @type {React.CSSProperties} */ ({
  ...dirtyDotStyle,
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
});

const localeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  letterSpacing: "0.06em",
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
});

// What a record in here is made of: the whole reason the second line exists, so
// it is the line's own text rather than a preview hanging off the end of it.
const shapeStyle = /** @type {React.CSSProperties} */ ({
  flex: "1 1 auto",
  minWidth: 0,
  fontWeight: 400,
  fontSize: dynamicSize(10),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});


const lockStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  display: "inline-flex",
  color: TEXT_MUTED,
});

// The row's anchor, opposite the key. A figure with its unit under it rather
// than a bare number: the unit is what makes a lone integer at the edge of a
// row mean records rather than fields, and the key at headline size is what
// keeps the figure from being the loudest thing here.
const countBoxStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
  flexShrink: 0,
  minWidth: 34,
});

const countNumberStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(17),
  lineHeight: 1.1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  color: TEXT_HI,
});

const countLabelStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(9.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
});

const chevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  flexShrink: 0,
  color: TEXT_MUTED,
});
