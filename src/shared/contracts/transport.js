/**
 * @file The data-access seam, contract only. The core never calls `fetch`
 * directly, it calls a `CmsTransport`. The default REST implementation lives
 * in `defaults/transport.js`; pass your own to target another backend via
 * `createCmsConfig({ transport })`.
 *
 * A transport never fetches a token, it only attaches the `accessToken` the
 * caller already resolved. So "how we talk to the backend" stays separate
 * from "what credential we send".
 */

/**
 * @import {
 *   ContentResponse,
 *   UpdatePageRequest,
 *   UpdatePageResponse,
 *   SyncManifestRequest,
 *   SyncResultResponse,
 *   CollectionListParams,
 *   CollectionListResponse,
 *   CollectionLookupResponse,
 *   CollectionItemResponse,
 *   MyCollectionResponse,
 * } from "./schemas.js"
 */

/**
 * Per-call options shared by every transport method.
 *
 * @typedef {Object} CmsRequestOptions
 * @property {string} [accessToken]
 *   Bearer credential to attach. Falsy → request goes out unauthenticated.
 * @property {{ revalidate?: number | false, tags?: string[] }} [cache]
 *   Opaque caching hint. The REST transport maps it onto Next.js'
 *   `next: { revalidate, tags }`; other transports may ignore it.
 * @property {AbortSignal} [signal]
 *   Forwarded to the underlying request when the transport supports it.
 * @property {string} [locale]
 *   Which language of the content this call addresses. Omitted on a
 *   single-language site, and the backend then falls back to the Client's
 *   default locale, which is what keeps the pre-i18n wire shape intact.
 *
 *   It rides here rather than in each method's signature so a custom transport
 *   that ignores it still satisfies the contract, and it belongs with
 *   `accessToken` / `cache` / `signal`: all four qualify a request without
 *   being part of what is being written.
 */

/**
 * The backend contract the core depends on. Implement this to target a
 * non-reference backend; the default REST adapter is `createRestTransport`.
 *
 * @typedef {Object} CmsTransport
 * @property {(slug: string, opts?: CmsRequestOptions) => Promise<ContentResponse>} getContent
 * @property {(key: string, params?: CollectionListParams, opts?: CmsRequestOptions) => Promise<CollectionListResponse>} getCollection
 * @property {(key: string, slug: string, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} getCollectionItem
 * @property {(key: string, params: { q?: string, slugs?: string[], locale?: string | null, limit?: number }, opts?: CmsRequestOptions) => Promise<CollectionLookupResponse>} [lookupCollection]
 *   Names and slugs for a picker, without the records behind them. Optional on
 *   the seam: a transport that has not implemented it makes collection-backed
 *   choices unavailable rather than breaking, and a field with a static source
 *   never needs it.
 * @property {(opts?: CmsRequestOptions) => Promise<MyCollectionResponse[]>} getMyCollections
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<UpdatePageResponse>} updateContent
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<void>} updateDraft
 * @property {(slug: string, opts?: CmsRequestOptions) => Promise<void>} deleteDraft
 * @property {(key: string, slug: string, payload: { data: *, version: number | null }, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} upsertCollectionItem
 * @property {(key: string, payload: { data: * }, opts?: CmsRequestOptions & { translationGroup?: string }) => Promise<CollectionItemResponse>} createCollectionItem
 *   `translationGroup` joins the new record to an existing one's group, making
 *   the two translations of each other. Omit it and the backend starts a fresh
 *   group, which is what every standalone record gets.
 * @property {(key: string, slug: string, version: number, opts?: CmsRequestOptions) => Promise<{ collectionKey: string, slug: string, version: number }>} archiveCollectionItem
 *   Takes the row out of every default view without deleting it: the slug stays
 *   reserved and the content survives. `version` must match or the call is a
 *   409, and it is not consumed, so the number that archived also restores.
 * @property {(key: string, slug: string, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} restoreCollectionItem
 * @property {(key: string, slug: string, payload: { slug: string, version: number }, opts?: CmsRequestOptions & { replaceAlias?: boolean }) => Promise<CollectionItemResponse>} [renameCollectionItem]
 *   Optional, and absence is an answer rather than a gap: a transport for a
 *   backend with no rename endpoint has nothing to implement here, and the
 *   editor reads a missing method the same way it reads a collection that never
 *   sent `slugEditable` — the affordance doesn't appear. So leaving it out
 *   costs nothing and never throws.
 *
 *   Move a saved record to a new slug, answering with the record itself at its
 *   new address and a version one higher. `version` is required and behaves
 *   like a save's: send the one the caller is holding or get a 409. The old
 *   slug becomes an alias, so reads of it keep resolving.
 *
 *   Two further 409s are specific to this call, told apart by `reason` on the
 *   error: `"taken"` (a record already holds the slug) and `"alias"` (the slug
 *   is another record's old address). `replaceAlias` forces past the second by
 *   repointing that address here, which breaks inbound links to the record
 *   named in `conflictingSlug`, so send it only on a user's say-so.
 *
 *   The response's `slug` is canonical and the caller's is now stale: keep
 *   writing to the old one and the next save addresses an alias.
 * @property {(key: string, slug: string, payload: { data: * }, opts?: CmsRequestOptions) => Promise<void>} saveCollectionItemDraft
 * @property {(key: string, slug: string, opts?: CmsRequestOptions) => Promise<void>} deleteCollectionItemDraft
 * @property {(key: string, payload: { data: * }, opts?: CmsRequestOptions & { translationGroup?: string }) => Promise<void>} saveCollectionNewDraft
 *   The pending slot stores no slug, so a `UserDefined` collection's typed slug
 *   stays in the composer's own state until it publishes through `PUT`. Sending
 *   one here is ignored, and a claim-derived slug is refused outright: those
 *   have a draft slot of their own under `saveCollectionItemDraft`.
 * @property {(key: string, opts?: CmsRequestOptions) => Promise<void>} deleteCollectionNewDraft
 * @property {(file: File, opts?: { onProgress?: (progress: number) => void, accessToken?: string | null }) => Promise<{ data: { url: string } }>} uploadImage
 * @property {(path: string, init?: RequestInit & { accessToken?: string }) => Promise<*>} [request]
 *   Escape hatch for the endpoints an app puts on the same backend beside the
 *   CMS API, which is what an admin panel (`createCmsPage({ panels })`) talks
 *   to. Unlike every method above it names no endpoint of ours: the path
 *   resolves against `baseUrl` itself, with no `/cms` prefix.
 *
 *   Optional for the same reason `renameCollectionItem` is: a transport with
 *   nothing behind it has nothing to implement, and a panel calling it then
 *   gets a named error rather than a bare `fetch` quietly bypassing the seam.
 * @property {(manifests: SyncManifestRequest[], opts?: CmsRequestOptions & { locales?: string[] }) => Promise<SyncResultResponse>} syncManifests
 *   `locales` is the site's full language list, not one language: sync is where
 *   the app tells the backend which languages exist, so the list has a single
 *   home (your config) instead of one copy per side that can drift. Omit it and
 *   the backend keeps whatever it has.
 */

export {};
