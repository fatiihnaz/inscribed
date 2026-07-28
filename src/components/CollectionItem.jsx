"use client";

/**
 * @file `<CollectionItem>`: render-prop primitive for one collection row.
 *
 * Public visitors get the children function's output. Admins with
 * `item.canEdit` also get a click-to-focus wrapper (like EditableRegion) that
 * opens the matching drawer card; edits and re-render happen there.
 *
 * `item` is null while loading and on error, so branch on `meta.isLoading` /
 * `meta.error` first. 404s arrive as `meta.error` with `error.isNotFound`.
 *
 *   <CollectionItem collection="News" slug="q1-release-notes">
 *     {(item, { isLoading, error }) => (
 *       isLoading            ? <Skeleton /> :
 *       error?.isNotFound    ? <NotFound /> :
 *       error                ? <ErrorBanner message={error.message} /> :
 *                              <Article {...item.data} />
 *     )}
 *   </CollectionItem>
 *
 * The binding identifies itself by the record it points at, so rendering the
 * same item twice on a page yields one drawer card, not two.
 */

import { useContext, useEffect, useState } from "react";

import { useCmsContext } from "../lib/context.js";
import { collectionItemBindingId, useCollectionContext } from "../lib/collection-context.js";
import { CmsGroupContext } from "../lib/group-context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useStoreSelector } from "../lib/store.js";
import { COLLECTION_ACCENT, FONT_MONO, TYPE_META } from "./admin-drawer-styles.js";
import {
  BLOCK_TAGS,
  regionBoxStyle,
  regionChipStyle,
  chipDirtyDotStyle,
} from "./page-region-chrome.js";

const COLLECTION_GLYPH = TYPE_META.Collection.glyph;

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/errors.js"
 */

/**
 * @typedef {Object} CollectionItemMeta
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {string} [group]
 * @property {string} [label]      Drawer card and page chip text (default: `"{collection} · {slug}"`).
 * @property {"global"} [scope]    Reserved; currently ignored (bindings are runtime-only).
 * @property {(item: CollectionItemResponse | null, meta: CollectionItemMeta) => React.ReactNode} children
 */

/**
 * @param {CollectionItemProps} props
 */
// eslint-disable-next-line no-unused-vars
export function CollectionItem({ collection, slug, group, label, scope: _scope, children }) {
  const { isAdmin, activeBlock, setActiveBlock } = useCmsContext();
  const {
    registerCollectionBinding, unregisterCollectionBinding, collectionStore,
  } = useCollectionContext();
  const groupPrefix = useContext(CmsGroupContext);

  const bindingId = collectionItemBindingId(collection, slug);
  const cardGroup = group ?? groupPrefix;
  const cardLabel = label ?? `${collection} · ${slug}`;

  // Hand the binding to the drawer for its Page-tab card. Public visitors
  // register too, keeping register/unregister symmetric across mode switches.
  useEffect(() => {
    registerCollectionBinding(bindingId, { collection, slug, group: cardGroup, label: cardLabel });
    return () => unregisterCollectionBinding(bindingId);
  }, [
    bindingId, collection, slug, cardGroup, cardLabel,
    registerCollectionBinding, unregisterCollectionBinding,
  ]);

  const { item, isLoading, error, refetch } = useCollectionItem(collection, slug);
  const drafts = useStoreSelector(collectionStore, (st) => st.drafts);
  const rendered = /** @type {*} */ (children(item, { isLoading, error, refetch }));

  if (!isAdmin || !item || !item.canEdit) return rendered;

  return (
    <CollectionEditWrapper
      onClick={() => setActiveBlock(bindingId)}
      isActive={activeBlock === bindingId}
      label={cardLabel}
      tag={typeof rendered?.type === "string" ? rendered.type : null}
      dirty={drafts.has(`${collection}:${slug}`) || item.draftData != null}
    >
      {rendered}
    </CollectionEditWrapper>
  );
}

/**
 * Same shell as `EditableRegion`, in the collection accent: a neutral ring on
 * hover, the accent once selected, and the padded card (plus a chip that
 * straddles its ring line) when the rendered content is block-level.
 *
 * @param {{
 *   onClick: (e: React.MouseEvent) => void,
 *   isActive: boolean,
 *   label: string,
 *   dirty: boolean,
 *   tag: string | null,
 *   children: React.ReactNode,
 * }} props
 */
function CollectionEditWrapper({ onClick, isActive, label, dirty, tag, children }) {
  const [isHovered, setIsHovered] = useState(false);
  const showChip = isHovered || isActive;

  const display = tag && BLOCK_TAGS.has(tag) ? "block" : "inline-block";
  const roomy = display === "block";

  return (
    <span
      style={regionBoxStyle({
        display,
        roomy,
        highlight: isActive,
        hovered: isHovered,
        accent: COLLECTION_ACCENT,
      })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {showChip ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
          title="Panelde aç"
          aria-label={`${label} kaydını panelde aç`}
          style={regionChipStyle({
            roomy,
            highlight: isActive,
            accent: COLLECTION_ACCENT,
            font: FONT_MONO,
          })}
        >
          <span aria-hidden="true" style={{ fontWeight: 700, opacity: 0.85 }}>
            {COLLECTION_GLYPH}
          </span>
          {label}
          {dirty ? (
            <span aria-label="Kaydedilmemiş değişiklik" style={chipDirtyDotStyle} />
          ) : null}
        </button>
      ) : null}
    </span>
  );
}
