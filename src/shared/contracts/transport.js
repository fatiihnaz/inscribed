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
 * @property {(opts?: CmsRequestOptions) => Promise<MyCollectionResponse[]>} getMyCollections
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<UpdatePageResponse>} updateContent
 * @property {(request: UpdatePageRequest, opts?: CmsRequestOptions) => Promise<void>} updateDraft
 * @property {(slug: string, opts?: CmsRequestOptions) => Promise<void>} deleteDraft
 * @property {(key: string, slug: string, payload: { data: *, version: number | null }, opts?: CmsRequestOptions) => Promise<CollectionItemResponse>} upsertCollectionItem
 * @property {(key: string, payload: { data: * }, opts?: CmsRequestOptions & { translationGroup?: string }) => Promise<CollectionItemResponse>} createCollectionItem
 *   `translationGroup` joins the new record to an existing one's group, making
 *   the two translations of each other. Omit it and the backend starts a fresh
 *   group, which is what every standalone record gets.
 * @property {(key: string, slug: string, payload: { data: * }, opts?: CmsRequestOptions) => Promise<void>} saveCollectionItemDraft
 * @property {(key: string, slug: string, opts?: CmsRequestOptions) => Promise<void>} deleteCollectionItemDraft
 * @property {(key: string, payload: { data: * }, opts?: CmsRequestOptions & { translationGroup?: string }) => Promise<void>} saveCollectionNewDraft
 *   The pending slot stores no slug, so a `UserDefined` collection's typed slug
 *   stays in the composer's own state until it publishes through `PUT`. Sending
 *   one here is ignored, and a claim-derived slug is refused outright: those
 *   have a draft slot of their own under `saveCollectionItemDraft`.
 * @property {(key: string, opts?: CmsRequestOptions) => Promise<void>} deleteCollectionNewDraft
 * @property {(file: File, opts?: { onProgress?: (progress: number) => void, accessToken?: string | null }) => Promise<{ data: { url: string } }>} uploadImage
 * @property {(manifests: SyncManifestRequest[], opts?: CmsRequestOptions & { locales?: string[] }) => Promise<SyncResultResponse>} syncManifests
 *   `locales` is the site's full language list, not one language: sync is where
 *   the app tells the backend which languages exist, so the list has a single
 *   home (your config) instead of one copy per side that can drift. Omit it and
 *   the backend keeps whatever it has.
 */

export {};
