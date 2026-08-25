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
import { ChevronRight, Lock, Search, TypeCollection } from "../shared/style/icons.jsx";

import { useCollectionContext } from "../collections/context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { collectDirtyRecords, dirtyCollectionKeys } from "./dirty.js";
import { useMyCollections } from "../collections/hooks/use-my-collections.js";

import { SkeletonRows } from "./Skeleton.jsx";
import { emptyStateStyle } from "../editors/styles.js";
import { paneStyle, toolbarStyle, searchWrapStyle, searchInputStyle, searchClearStyle, listStyle, dirtyDotStyle, rowPathStyle, typeIconStyle } from "./drawer-styles.js";
import { TEXT, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, FONT_SANS, R_MD } from "../shared/style/tokens.js";

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

      {isLoading && visible.length === 0 ? (
        <SkeletonRows count={5} lines={2} height={44} />
      ) : visible.length === 0 ? (
        <div style={emptyStateStyle}>
          {search
            ? t("collections.noSearchResults", { query: search })
            : t("collections.noneAccessible")}
        </div>
      ) : (
        <ul style={collectionListStyle} data-cms-list>
          {groups.map((group) => (
            <Fragment key={group.labelKey ?? "all"}>
              {group.labelKey ? (
                <li style={groupLabelStyle}>{t(group.labelKey)}</li>
              ) : null}
              {group.items.map((c) => (
                <li key={c.collectionKey} style={{ listStyle: "none" }}>
                  <CollectionRow
                    collectionKey={c.collectionKey}
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
    </section>
  );
});

// Enough of the shape to recognise a collection by, not the whole schema. The
// count beside it says how much was left out.
const SHAPE_FIELDS = 5;

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
 * One collection, on the drawer's own vocabulary but over two lines: a
 * collection carries more than a row can hold on one, and the panel is 412px
 * wide. Line one is identity (glyph, key, draft), line two is properties (what
 * a record is made of, how many fields, which languages, whether it is closed
 * to new records).
 *
 * What makes this the drawer's row rather than its own thing is the vocabulary,
 * not the line count: the block list's 20px glyph at its own size, and the
 * block path's exact type for the key, because a collection key is the same
 * kind of literal identifier a block path is.
 *
 * The glyph carries the page binding as its colour, and only as its colour: the
 * section heading above the group already says it in words, so a name on the
 * glyph would make every row in that group announce it again.
 *
 * @param {{
 *   collectionKey: string,
 *   fields: import("../shared/contracts/schemas.js").CollectionFieldDescriptor[] | undefined,
 *   locales: string[] | undefined,
 *   canCreate: boolean,
 *   onPage: boolean,
 *   dirty: boolean,
 *   onOpen: () => void,
 * }} props
 */
function CollectionRow({ collectionKey, fields, locales, canCreate, onPage, dirty, onOpen }) {
  const t = useCmsStrings();
  const shape = fields?.length ? shapeOf(fields) : "";
  // A single language is the site's own default, so naming it says nothing. The
  // marker earns its place only where the collection actually holds more.
  const languages = locales && locales.length > 1
    ? locales.map((l) => l.toUpperCase()).join(" ")
    : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inscribed-collection-row"
      style={rowStyle}
    >
      <span style={onPage ? badgeOnPageStyle : badgeStyle} aria-hidden="true">
        <TypeCollection size={13} />
      </span>

      <span style={textColStyle}>
        <span style={identityLineStyle}>
          <span style={keyStyle} title={collectionKey}>{collectionKey}</span>
          {/* Against the key, not out at the chevron: the draft belongs to this
              collection, and a dot alone on the far edge read as a row-level
              status light with nothing to attach it to. */}
          {dirty ? (
            <span style={collectionDotStyle} aria-label={t("block.unsavedDot")} />
          ) : null}
        </span>

        <span style={propertyLineStyle}>
          {shape ? <span style={shapeStyle} title={shape}>{shape}</span> : null}
          {fields?.length ? (
            <span style={countStyle}>{t("collections.fieldCount", { count: fields.length })}</span>
          ) : null}
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

// Two lines of 11px inside the same 12px inset the one-line rows use, which
// puts the box at 44px: the 32px control height plus one more line.
const rowStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 44,
  padding: "7px 12px",
  border: 0,
  borderRadius: R_MD,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

// The block list's type badge, at its size and without its fill. The tinted
// 28px square it replaces was the loudest object in the drawer, and it marked
// nothing: every row in this list is a collection.
const badgeStyle = /** @type {React.CSSProperties} */ ({
  ...typeIconStyle,
  color: TEXT,
});

// Bound to the page being looked at. The colour is the whole signal, so it is
// the accent itself rather than a tint of it.
const badgeOnPageStyle = /** @type {React.CSSProperties} */ ({
  ...typeIconStyle,
  color: COLLECTION_ACCENT,
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
  gap: 8,
  minWidth: 0,
});

// A collection key is a literal identifier, exactly like a block path, so it is
// the block path's own style. It used to be 13px sans, two steps above every
// other identifier in the drawer.
//
// The basis is the override: at the block path's `flex: 1` the key grows into
// the whole line, which carries the draft dot beside it out to the far edge
// where it reads as a row-level status light. Sized from its own text, the dot
// stays against the key.
const keyStyle = /** @type {React.CSSProperties} */ ({
  ...rowPathStyle,
  flex: "0 1 auto",
});

// Sentence case at the panel's own size, not tracked-out micro-caps. The drawer
// speaks in sentence case everywhere else (its buttons, its empty states, its
// menus), and 10px uppercase with wide tracking is a badge wearing a heading's
// job.
const groupLabelStyle = /** @type {React.CSSProperties} */ ({
  listStyle: "none",
  padding: "12px 12px 4px",
  font: `500 11px/1 ${FONT_SANS}`,
  letterSpacing: "-0.005em",
  color: TEXT_MUTED,
});

const collectionDotStyle = /** @type {React.CSSProperties} */ ({
  ...dirtyDotStyle,
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
});

const localeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  font: `500 10px/1 ${FONT_SANS}`,
  letterSpacing: "0.06em",
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
});

// What a record in here is made of: the whole reason the second line exists, so
// it is the line's own text rather than a preview hanging off the end of it.
const shapeStyle = /** @type {React.CSSProperties} */ ({
  flex: "1 1 auto",
  minWidth: 0,
  font: `11px/1.2 ${FONT_SANS}`,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const countStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  font: `500 10px/1 ${FONT_SANS}`,
  fontVariantNumeric: "tabular-nums",
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
});

const lockStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  display: "inline-flex",
  color: TEXT_MUTED,
});

const chevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  flexShrink: 0,
  color: TEXT_MUTED,
});
