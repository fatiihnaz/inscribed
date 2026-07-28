"use client";

/**
 * @file Collections mode landing surface: every collection the user can reach
 * (per `/me`), not just the ones this page binds. Picking one hands off to
 * `<AdminCollectionRegionPanel scope="global">`.
 *
 * Rows carry a "bu sayfada" chip when the current page declares a region or
 * item binding for that collection, so the global list still says which entries
 * belong to what the user is looking at.
 */

import { memo, useMemo, useState } from "react";
import { ChevronRight, Search } from "./icons.jsx";

import { useCollectionContext } from "../lib/collection-context.js";
import { useStoreSelector } from "../lib/store.js";
import { useMyCollections } from "../hooks/use-my-collections.js";

import {
  TEXT,
  TEXT_MID,
  TEXT_FAINT,
  TEXT_MUTED,
  COLLECTION_ACCENT,
  COLLECTION_SOFT,
  SURFACE_1,
  HAIRLINE,
  FONT_MONO,
  R_SM,
  paneStyle,
  emptyStateStyle,
  toolbarStyle,
  searchWrapStyle,
  searchInputStyle,
  searchClearStyle,
} from "./admin-drawer-styles.js";

/**
 * Memoised: it stays mounted (and animating) underneath an open collection, so
 * it must not re-render just because the drawer above it did. Its own store
 * subscriptions still refresh it when collection state actually changes.
 *
 * @param {{ onSelect: (collectionKey: string) => void }} props
 */
export const AdminCollectionsPane = memo(function AdminCollectionsPane({ onSelect }) {
  const { collectionBindings, collectionStore } = useCollectionContext();
  const { collections, isLoading } = useMyCollections();
  const [search, setSearch] = useState("");

  const drafts = useStoreSelector(collectionStore, (s) => s.drafts);
  const itemCache = useStoreSelector(collectionStore, (s) => s.itemCache);

  // Per-collection dirty, unioning live overlay drafts with cached items that
  // carry a server draft. Same two-source union the drawer's dirty dots use:
  // the overlay clears once autosave lands, which would otherwise drop the mark.
  const dirtyKeys = useMemo(() => {
    /** @type {Set<string>} */
    const set = new Set();
    for (const key of drafts.keys()) {
      const i = key.indexOf(":");
      if (i > 0) set.add(key.slice(0, i));
    }
    for (const [key, entry] of itemCache) {
      if (!entry.item || entry.item.draftData == null) continue;
      const i = key.indexOf(":");
      if (i > 0) set.add(key.slice(0, i));
    }
    return set;
  }, [drafts, itemCache]);

  const boundKeys = useMemo(() => {
    /** @type {Set<string>} */
    const set = new Set();
    for (const [, binding] of collectionBindings) set.add(binding.collection);
    return set;
  }, [collectionBindings]);

  // Page-bound collections sort first: they're what the user is most likely
  // reaching for while looking at this page.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? collections.filter((c) => c.collectionKey.toLowerCase().includes(q))
      : collections;
    return [...filtered].sort((a, b) => {
      const aBound = boundKeys.has(a.collectionKey) ? 0 : 1;
      const bBound = boundKeys.has(b.collectionKey) ? 0 : 1;
      if (aBound !== bBound) return aBound - bBound;
      return a.collectionKey.localeCompare(b.collectionKey);
    });
  }, [collections, boundKeys, search]);

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
              placeholder="Koleksiyon ara"
              aria-label="Koleksiyon ara"
              style={searchInputStyle}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="inscribed-search-clear"
                style={searchClearStyle}
                aria-label="Temizle"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div style={emptyStateStyle}>
          {isLoading
            ? "Koleksiyonlar yükleniyor…"
            : search
              ? `"${search}" araması için sonuç yok.`
              : "Erişebildiğin bir koleksiyon yok."}
        </div>
      ) : (
        <div style={scrollStyle}>
          <ul style={listStyle}>
            {visible.map((c) => (
              <li key={c.collectionKey} style={{ listStyle: "none" }}>
                <CollectionRow
                  collectionKey={c.collectionKey}
                  fieldCount={c.schema?.fields?.length ?? 0}
                  canCreate={Boolean(c.canCreate)}
                  onPage={boundKeys.has(c.collectionKey)}
                  dirty={dirtyKeys.has(c.collectionKey)}
                  onOpen={() => onSelect(c.collectionKey)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});

/**
 * Two-line row: an initial badge for scanning, the key, and a quiet meta line.
 * The badge carries the collection tint so the list reads as collection
 * territory the moment it opens.
 *
 * @param {{
 *   collectionKey: string,
 *   fieldCount: number,
 *   canCreate: boolean,
 *   onPage: boolean,
 *   dirty: boolean,
 *   onOpen: () => void,
 * }} props
 */
function CollectionRow({ collectionKey, fieldCount, canCreate, onPage, dirty, onOpen }) {
  const meta = [
    fieldCount > 0 ? `${fieldCount} alan` : null,
    canCreate ? "yeni kayıt eklenebilir" : null,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inscribed-region-row"
      style={rowStyle}
    >
      <span style={badgeStyle} aria-hidden="true">
        {collectionKey.slice(0, 1).toUpperCase()}
      </span>

      <span style={textColStyle}>
        <span style={titleRowStyle}>
          <span style={keyStyle} title={collectionKey}>{collectionKey}</span>
          {onPage ? <span style={pageChipStyle}>bu sayfada</span> : null}
          {dirty ? (
            <span style={dirtyDotStyle} aria-label="Kaydedilmemiş değişiklik" />
          ) : null}
        </span>
        {meta ? <span style={metaStyle}>{meta}</span> : null}
      </span>

      <span
        className="inscribed-region-row-chevron"
        style={chevronStyle}
        aria-hidden="true"
      >
        <ChevronRight size={13} />
      </span>
    </button>
  );
}

const scrollStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  paddingBottom: 16,
});

const listStyle = /** @type {React.CSSProperties} */ ({
  margin: 0,
  padding: 0,
  listStyle: "none",
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 16px",
  border: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

const badgeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 26,
  height: 26,
  borderRadius: R_SM,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  font: `600 11px/1 ${FONT_MONO}`,
  color: COLLECTION_ACCENT,
  background: COLLECTION_SOFT,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
});

const textColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const titleRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
});

const keyStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  font: `500 12px/1.2 ${FONT_MONO}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const metaStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 10.5,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const pageChipStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MID,
  fontSize: 9,
  padding: "1px 6px",
  background: SURFACE_1,
  borderRadius: 3,
  letterSpacing: "0.05em",
  flexShrink: 0,
});

const dirtyDotStyle = /** @type {React.CSSProperties} */ ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
  flexShrink: 0,
});

const chevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: TEXT_FAINT,
  flexShrink: 0,
});
