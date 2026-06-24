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
 *   CollectionItemResponse,
 *   MyCollectionResponse,
 *   PagedListResponse,
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
 */

/**
 * The backend contract the core depends on. Implement this to target a
 * non-reference backend; the default REST adapter is `createRestTransport`.
 *
 * @typedef {Object} CmsTransport
 * @property {(slug: string, opts?: CmsRequestOptions) => Promise<ContentResponse>} getContent
 * @property {(key: string, params?: CollectionListParams, opts?: CmsRequestOptions) => Promise<PagedListResponse<CollectionItemResponse>>} getCollection
 * @property {(key: string, slug: string, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} getCollectionItem
 * @property {(opts?: CmsRequestOptions) => Promise<MyCollectionResponse[]>} getMyCollections
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<UpdatePageResponse>} updateContent
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<void>} updateDraft
 * @property {(key: string, slug: string, payload: { data: *, version: number | null }, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} upsertCollectionItem
 * @property {(key: string, payload: { data: * }, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} createCollectionItem
 * @property {(key: string, slug: string, payload: { data: * }, opts?: CmsRequestOptions) => Promise<void>} saveCollectionItemDraft
 * @property {(key: string, payload: { slug?: string, data: * }, opts?: CmsRequestOptions) => Promise<void>} saveCollectionNewDraft
 * @property {(file: File, opts?: { onProgress?: (progress: number) => void, accessToken?: string | null }) => Promise<{ data: { url: string } }>} uploadImage
 * @property {(manifests: SyncManifestRequest[], opts?: CmsRequestOptions) => Promise<SyncResultResponse>} syncManifests
 */

export {};
