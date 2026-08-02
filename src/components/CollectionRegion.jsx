"use client";

/**
 * @file `<CollectionRegion>`: a whole collection (all Teams, all News), rendered
 * by repeating element children once per row.
 *
 *   <CollectionRegion collection="news" limit={5} as="ul" empty={<p>Yok.</p>}>
 *     <li>
 *       <CollectionField name="title" as="h3" />
 *     </li>
 *   </CollectionRegion>
 *
 * Children are elements, not a function, so the same markup works from a Server
 * Component: `createCmsPage` returns a server `<CollectionRegion>` that awaits
 * the window and hands the rows to `<CollectionRows>` below. Each row gets its
 * own record scope, so `<CollectionField>` and `useCollectionRecord()` resolve
 * against the row they are rendered in.
 *
 * Read-only here; writes happen through the record's own drawer card or its
 * in-place fields. The binding registers into the runtime registry so the drawer
 * shows a lane for it (discovery ignores collections; they never enter the
 * manifest).
 */

import { useEffect } from "react";

import { collectionRegionBindingId, useCollectionContext } from "../lib/collection-context.js";
import { CollectionRecord } from "./CollectionItem.jsx";
import { useCollection } from "../hooks/use-collection.js";
import { buildListParams } from "../lib/collection-params.js";

/**
 * @import { CollectionItemResponse, CollectionListParams } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} CollectionRegionProps
 * @property {string} collection
 *   Backend collection key (e.g. "teams", "news").
 * @property {Record<string, *>} [filter]
 *   Filter forwarded to the API as query keys. Each must be a filterable schema
 *   field or the request 400s. Inline literals are fine; the hook dedupes by
 *   `stableStringify`.
 * @property {number} [limit]   Page size (default 50, max 100, min 1).
 * @property {number} [offset]  Pagination offset (default 0).
 * @property {string} [as]
 *   Wrapper element for the rows (e.g. "ul"). Without it the rows land straight
 *   in whatever container encloses the region. Extra props go to it.
 * @property {React.ReactNode} [fallback]
 *   Shown while the window loads. Client path only; the server one has awaited
 *   the rows before rendering anything.
 * @property {React.ReactNode} [empty]
 *   Shown when the window resolves to zero rows. Defaults to nothing.
 * @property {React.ReactNode} [error]
 *   Shown when the read failed. Defaults to `empty`. Retry needs a callback,
 *   which no longer crosses the children boundary: build one with
 *   `useCollection` in your own client component.
 * @property {React.ReactNode} children  Rendered once per row.
 */

/**
 * Client entry point: fetches the window, then hands the rows to
 * `CollectionRows`.
 *
 * @param {CollectionRegionProps & Record<string, *>} props
 */
export function CollectionRegion({
  collection, filter, limit, offset, as, fallback, empty, error: errorNode, children, ...rest
}) {
  const params = buildListParams({ filter, limit, offset });

  const { items, isLoading, error } = useCollection(collection, params);

  if (isLoading) return fallback ?? null;
  if (error) return errorNode ?? empty ?? null;

  return (
    <CollectionRows
      collection={collection} items={items} filter={filter} limit={limit} offset={offset}
      as={as} empty={empty} {...rest}
    >
      {children}
    </CollectionRows>
  );
}

/**
 * Register the (collection, filter) window so the drawer's per-collection panel
 * can mirror it ("filter parity"). Shared with the server entry point, which
 * renders `<CollectionRows>` directly.
 *
 * @param {string} collection
 * @param {Record<string, *>} [filter]
 * @param {number} [limit]
 * @param {number} [offset]
 * @returns {string} the binding id
 */
function useRegionBinding(collection, filter, limit, offset) {
  const { registerCollectionBinding, unregisterCollectionBinding } = useCollectionContext();
  const bindingId = collectionRegionBindingId(collection, filter);

  useEffect(() => {
    /** @type {import("../lib/schemas.js").CollectionBinding} */
    const binding = { collection };
    if (filter) binding.filter = filter;
    if (typeof limit === "number") binding.limit = limit;
    if (typeof offset === "number") binding.offset = offset;
    registerCollectionBinding(bindingId, binding);
    return () => unregisterCollectionBinding(bindingId);
    // `bindingId` stands in for `filter`: an inline literal is a new object on
    // every render, and re-running this effect on it would churn the registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingId, collection, limit, offset, registerCollectionBinding, unregisterCollectionBinding]);

  return bindingId;
}

/**
 * Rows without the fetch: registers the window with the drawer, then repeats
 * `children` once per record, each under its own scope. Shared by the client
 * entry above and the server one, which awaits `getCmsCollection` and passes
 * `items` straight in.
 *
 * The same element tree is rendered N times; React treats each as its own
 * instance, so a row's fields resolve against that row's record.
 *
 * This is one of the two components the server entry point renders into, so it
 * has to be a **named export of this client module**: a client component smuggled
 * inside a plain object loses its boundary, since only the exports themselves
 * become client references. Registration lives here rather than in a separate
 * leaf for the same reason, one export fewer to hand across.
 *
 * @param {{
 *   collection: string,
 *   items: CollectionItemResponse[],
 *   filter?: Record<string, *>,
 *   limit?: number,
 *   offset?: number,
 *   as?: string,
 *   empty?: React.ReactNode,
 *   children: React.ReactNode,
 * } & Record<string, *>} props
 */
export function CollectionRows({
  collection, items, filter, limit, offset, as, empty, children, ...rest
}) {
  // Before the early return: an empty collection still deserves its drawer lane.
  const regionBindingId = useRegionBinding(collection, filter, limit, offset);

  if (items.length === 0) return empty ?? null;

  // Rows carry their origin so the drawer can tell "a record placed on the page"
  // from "a row of a window the page already points at", and list the second
  // kind only once, behind the region's reference row.
  const rows = items.map((item) => (
    <CollectionRecord
      key={item.slug}
      collection={collection}
      slug={item.slug}
      item={item}
      fromRegion={regionBindingId}
    >
      {children}
    </CollectionRecord>
  ));

  if (!as) return <>{rows}</>;
  const Wrapper = /** @type {*} */ (as);
  return <Wrapper {...rest}>{rows}</Wrapper>;
}
