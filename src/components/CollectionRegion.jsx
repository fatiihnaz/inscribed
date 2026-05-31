"use client";

/**
 * @file `<CollectionRegion>` - render-prop primitive for a whole collection
 * (e.g. all Teams, all News). The CMS is read-only here; writes happen in
 * the collection's own admin surface.
 *
 * Discovery picks the JSX up via the AST scanner and emits a Collection
 * block into the manifest so the AdminDrawer can show "this page reads
 * from collection X". Runtime ignores the blockPath - it fetches by
 * `collection` directly through `useCollection`.
 *
 *   <CollectionRegion blockPath="news.list" collection="News">
 *     {(items, { isLoading, error }) => (
 *       isLoading ? <Skeleton /> :
 *       error    ? <ErrorBanner message={error.message} /> :
 *                  items.map(i => <NewsCard key={i.id} {...i.data} />)
 *     )}
 *   </CollectionRegion>
 */

import { useContext, useEffect } from "react";

import { useCmsContext } from "../lib/context.js";
import { CmsGroupContext } from "../lib/group-context.js";
import { useCollection } from "../hooks/use-collection.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/errors.js"
 */

/**
 * @typedef {Object} CollectionRegionProps
 * @property {string} blockPath
 *   Identifier for the binding inside the page; the drawer uses it to
 *   disambiguate when the same collection is referenced multiple times.
 * @property {string} collection
 *   Backend collection key (e.g. "Teams", "News").
 * @property {Record<string, *>} [filter]
 *   Filter object forwarded to the API as query keys. Each key must
 *   match a filterable schema field on the collection or the request
 *   returns 400. Pass a memoised reference for the most efficient
 *   re-render behaviour, but inline literals are also fine - the hook
 *   layer dedupes by `stableStringify`.
 * @property {number} [limit]   Page size (default 50, max 100, min 1).
 * @property {number} [offset]  Pagination offset (default 0).
 * @property {"global"} [scope]
 *   Discovery-only marker; runtime ignores it.
 * @property {(items: CollectionItemResponse[], meta: CollectionRegionMeta) => React.ReactNode} children
 */

/**
 * @typedef {Object} CollectionRegionMeta
 * @property {boolean} isLoading
 * @property {import("../lib/errors.js").CmsApiError | Error | null} error
 * @property {() => Promise<void>} refetch
 * @property {number} total
 * @property {number} offset
 * @property {number} limit
 */

/**
 * @param {CollectionRegionProps} props
 */
// eslint-disable-next-line no-unused-vars
export function CollectionRegion({ blockPath, collection, filter, limit, offset, scope: _scope, children }) {
  const { registerCollectionBinding, unregisterCollectionBinding } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Drawer's per-collection panel reads this binding to mirror the same
  // filter window in its own sub-section ("filter parity").
  useEffect(() => {
    /** @type {{ collection: string, filter?: Record<string, *>, limit?: number, offset?: number }} */
    const binding = { collection };
    if (filter) binding.filter = filter;
    if (typeof limit === "number") binding.limit = limit;
    if (typeof offset === "number") binding.offset = offset;
    registerCollectionBinding(fullPath, binding);
    return () => unregisterCollectionBinding(fullPath);
  }, [fullPath, collection, filter, limit, offset, registerCollectionBinding, unregisterCollectionBinding]);

  /** @type {import("../lib/schemas.js").CollectionListParams | undefined} */
  const params = filter || typeof limit === "number" || typeof offset === "number"
    ? { ...(filter ? { filter } : {}), ...(typeof limit === "number" ? { limit } : {}), ...(typeof offset === "number" ? { offset } : {}) }
    : undefined;

  const { items, total, offset: gotOffset, limit: gotLimit, isLoading, error, refetch } = useCollection(collection, params);
  return /** @type {*} */ (
    children(items, { isLoading, error, refetch, total, offset: gotOffset, limit: gotLimit })
  );
}
