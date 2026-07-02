"use client";

/**
 * @file `<CollectionRegion>`: render-prop primitive for a whole collection
 * (all Teams, all News). Read-only here; writes happen in the collection's own
 * admin surface. The binding registers into the runtime registry on mount so
 * the drawer shows a tab for it (discovery ignores collections; they never
 * enter the manifest); items fetch by `collection` through `useCollection`.
 *
 *   <CollectionRegion blockPath="news.list" collection="News">
 *     {(items, { isLoading, error }) => (
 *       isLoading ? <Skeleton /> :
 *       error    ? <ErrorBanner message={error.message} /> :
 *                  items.map(i => <NewsCard key={i.slug} {...i.data} />)
 *     )}
 *   </CollectionRegion>
 */

import { useContext, useEffect } from "react";

import { useCollectionContext } from "../lib/collection-context.js";
import { CmsGroupContext } from "../lib/group-context.js";
import { useCollection } from "../hooks/use-collection.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/errors.js"
 */

/**
 * @typedef {Object} CollectionRegionProps
 * @property {string} blockPath
 *   Binding identifier; lets the drawer disambiguate repeated references to
 *   the same collection.
 * @property {string} collection
 *   Backend collection key (e.g. "Teams", "News").
 * @property {Record<string, *>} [filter]
 *   Filter forwarded to the API as query keys. Each must be a filterable
 *   schema field or the request 400s. Inline literals are fine; the hook
 *   dedupes by `stableStringify`.
 * @property {number} [limit]   Page size (default 50, max 100, min 1).
 * @property {number} [offset]  Pagination offset (default 0).
 * @property {"global"} [scope]
 *   Reserved; currently ignored. Collection bindings are runtime-only, so
 *   neither discovery nor the registry reads it.
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
  const { registerCollectionBinding, unregisterCollectionBinding } = useCollectionContext();
  const groupPrefix = useContext(CmsGroupContext);
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // The drawer's per-collection panel reads this binding to mirror the same
  // filter window ("filter parity").
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
