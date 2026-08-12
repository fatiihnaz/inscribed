/**
 * @file One builder for `useCollection` / `getCmsCollection` params, so the
 * page, the server fetch and the drawer address the same cache entry.
 *
 * They had three copies and two behaviours: two treated `offset: 0` as
 * significant, the drawer dropped it. That split produced a second cache key
 * (and a second GET) for the same window whenever a page spelled `offset={0}`.
 */

/**
 * @import { CollectionListParams } from "../shared/contracts/schemas.js"
 */

/** What the backend sorts by when asked for nothing. */
export const DEFAULT_SORT = "slug:asc";

/**
 * Build a params object, omitting keys that don't narrow the window.
 *
 * `offset: 0` is dropped rather than kept: it addresses the same rows as an
 * omitted offset, and the common case is a page writing no offset at all. Were
 * zero significant instead, the drawer's `offset=0` window would never collapse
 * onto the page's entry and every region would be fetched twice.
 *
 * `locale` belongs here rather than beside the access token: it narrows which
 * rows come back exactly as a filter does, and this object is what the client
 * hashes into a cache key, so a locale kept outside it would let two languages
 * of one collection share an entry.
 *
 * Returns `undefined` when nothing narrows the window, which is the shape
 * `useCollection` and `getCmsCollection` treat as "the default page".
 *
 * `sort` and `archived` follow the same rule as `offset: 0`: the backend's own
 * defaults are `slug:asc` and live rows, so spelling either one out would fork
 * the cache key away from the plain window that asks for the same thing.
 *
 * @param {{ filter?: Record<string, *>, limit?: number, offset?: number, locale?: string|null, sort?: string|null, archived?: boolean }} [input]
 * @returns {CollectionListParams | undefined}
 */
export function buildListParams({ filter, limit, offset, locale, sort, archived } = {}) {
  /** @type {CollectionListParams} */
  const params = {};
  if (filter) params.filter = filter;
  if (typeof limit === "number") params.limit = limit;
  if (typeof offset === "number" && offset !== 0) params.offset = offset;
  if (locale) params.locale = locale;
  if (sort && sort !== DEFAULT_SORT) params.sort = sort;
  if (archived) params.archived = true;
  return Object.keys(params).length > 0 ? params : undefined;
}
