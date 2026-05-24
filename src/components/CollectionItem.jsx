"use client";

/**
 * @file `<CollectionItem>` - render-prop primitive for a single collection
 * row (e.g. one team, one news article).
 *
 * Public visitors render whatever the consumer's children function
 * returns. Admins with `item.canEdit === true` get an extra layer: the
 * rendered output is wrapped in a click-to-focus affordance (matches
 * EditableRegion's pattern) that opens the matching drawer Page-tab
 * card. Edits happen in the drawer via a schema-driven form; the page
 * preview re-renders after a successful save.
 *
 * 404s come through `meta.error` with `error.isNotFound === true` so the
 * consumer can branch on the same try-catch surface that handles other
 * errors. The render-prop receives `item: null` while loading and on
 * error - branch on `meta.isLoading` / `meta.error` before reading
 * `item.data`.
 *
 *   <CollectionItem blockPath="news.hero" collection="News" slug="q1-release-notes">
 *     {(item, { isLoading, error }) => (
 *       isLoading            ? <Skeleton /> :
 *       error?.isNotFound    ? <NotFound /> :
 *       error                ? <ErrorBanner message={error.message} /> :
 *                              <Article {...item.data} />
 *     )}
 *   </CollectionItem>
 */

import { useContext, useEffect, useState } from "react";

import { useCmsContext } from "../lib/context.js";
import { CmsGroupContext } from "../lib/group-context.js";
import { useCollectionItem } from "../hooks/use-collection.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/api-client.js"
 */

/**
 * @typedef {Object} CollectionItemMeta
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} blockPath
 *   Discovery-time identifier. Runtime no-op; the hook fetches by
 *   `collection` + `slug`.
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {"global"} [scope]    Discovery-only marker for shared UI.
 * @property {(item: CollectionItemResponse | null, meta: CollectionItemMeta) => React.ReactNode} children
 */

/**
 * @param {CollectionItemProps} props
 */
// eslint-disable-next-line no-unused-vars
export function CollectionItem({ blockPath, collection, slug, scope: _scope, children }) {
  const {
    isAdmin,
    activeBlock,
    setActiveBlock,
    registerCollectionBinding,
    unregisterCollectionBinding,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Hand the binding to the drawer so it can render a matching card in
  // the Page tab. Public visitors register too - harmless overhead, and
  // it keeps register/unregister symmetric across mode switches.
  useEffect(() => {
    registerCollectionBinding(fullPath, { collection, slug });
    return () => unregisterCollectionBinding(fullPath);
  }, [fullPath, collection, slug, registerCollectionBinding, unregisterCollectionBinding]);

  const { item, isLoading, error, refetch } = useCollectionItem(collection, slug);
  const rendered = /** @type {*} */ (children(item, { isLoading, error, refetch }));

  // Only wrap when there's something to edit AND the user can edit it.
  // No item / no canEdit → render as-is (public preview surface).
  if (!isAdmin || !item || !item.canEdit) return rendered;

  return (
    <CollectionEditWrapper
      onClick={() => setActiveBlock(fullPath)}
      isActive={activeBlock === fullPath}
      label={`${collection} · ${slug}`}
    >
      {rendered}
    </CollectionEditWrapper>
  );
}

const RING_HOVER  = "0 0 0 1.5px rgba(140, 130, 210, 0.45)";
const RING_ACTIVE = "0 0 0 2px rgba(140, 130, 210, 0.80)";
const BG_HOVER    = "rgba(140, 130, 210, 0.05)";
const BG_ACTIVE   = "rgba(140, 130, 210, 0.10)";

/**
 * @param {{
 *   onClick: (e: React.MouseEvent) => void,
 *   isActive: boolean,
 *   label: string,
 *   children: React.ReactNode,
 * }} props
 */
function CollectionEditWrapper({ onClick, isActive, label, children }) {
  const [isHovered, setIsHovered] = useState(false);
  const showChip = isHovered || isActive;
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        boxShadow: isActive ? RING_ACTIVE : isHovered ? RING_HOVER : undefined,
        background: isActive ? BG_ACTIVE : isHovered ? BG_HOVER : undefined,
        transition: "box-shadow 0.15s ease, background-color 0.2s ease",
        cursor: "pointer",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {showChip ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: isActive ? -2 : -1.5,
            transform: "translateY(-100%)",
            background: "#221d18",
            border: "1px solid rgba(255,255,255,0.10)",
            borderBottom: "none",
            borderRadius: "4px 4px 0 0",
            padding: "1px 6px",
            fontSize: 9,
            fontWeight: 500,
            color: "rgba(190, 180, 230, 0.85)",
            letterSpacing: "0.05em",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            zIndex: 9999,
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
