/**
 * @file Low-level fetch wrapper for the CMS backend.
 *
 * No React, no browser-only APIs - safe to call from server components,
 * route handlers, or client hooks. Each function takes an explicit config
 * so callers stay in control of where credentials come from.
 */

/**
 * @import { CmsConfig } from "./config.js"
 * @import {
 *   ContentResponse,
 *   UpdatePageRequest,
 *   UpdatePageResponse,
 *   SyncManifestRequest,
 *   SyncResultResponse,
 *   ProblemDetails,
 * } from "./schemas.js"
 */

/**
 * Error thrown for any non-2xx response. Carries the backend's
 * ProblemDetails payload when one is available, plus a `blockPath` hint
 * for 409 conflicts so callers can surface per-field errors.
 */

export class CmsApiError extends Error {
  /**
   * @param {Object} args
   * @param {number} args.status
   * @param {string} args.detail
   * @param {string} [args.title]
   * @param {ProblemDetails|null} [args.problem]
   * @param {string|null} [args.blockPath]
   */
  constructor({ status, detail, title, problem, blockPath }) {
    super(detail || title || `CMS request failed (${status})`);
    this.name = "CmsApiError";
    this.status = status;
    this.title = title ?? null;
    this.detail = detail ?? null;
    this.problem = problem ?? null;
    this.blockPath = blockPath ?? null;
  }

  get isConflict() {
    return this.status === 409;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

/**
 * Build common headers. GET-only helper; PUT adds `X-User-Sub` separately.
 *
 * @param {CmsConfig} config
 * @returns {Record<string, string>}
 */
function baseHeaders(config) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  if (config.clientId) headers["X-CMS-Client-Id"] = config.clientId;
  if (config.clientSecret) headers["X-CMS-Client-Secret"] = config.clientSecret;
  return headers;
}

/**
 * Parse a non-2xx response into a CmsApiError. Tolerates non-JSON bodies.
 *
 * @param {Response} response
 * @returns {Promise<CmsApiError>}
 */
async function toApiError(response) {
  /** @type {ProblemDetails|null} */
  let problem = null;
  try {
    const text = await response.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        problem = /** @type {ProblemDetails} */ (parsed);
      }
    }
  } catch {
    // non-JSON body; fall through with problem = null
  }

  const blockPath =
    problem && typeof (/** @type {*} */ (problem).blockPath) === "string"
      ? /** @type {*} */ (problem).blockPath
      : null;

  return new CmsApiError({
    status: response.status,
    title: problem?.title,
    detail: problem?.detail || response.statusText,
    problem,
    blockPath,
  });
}

/**
 * Build a URL with query parameters under the `/cms` prefix.
 *
 * @param {CmsConfig} config
 * @param {string} path  e.g. "/content"
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
function buildUrl(config, path, params) {
  const url = new URL(`${config.baseUrl}/cms${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * `GET /cms/content?slug={slug}` - full block list for a page.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {RequestInit} [init]  Forwarded to fetch (e.g. Next.js `next` cache opts).
 * @returns {Promise<ContentResponse>}
 */
export async function fetchContent(config, slug, init) {
  const response = await fetch(buildUrl(config, "/content", { slug }), {
    ...init,
    method: "GET",
    headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {ContentResponse} */ (await response.json());
}

/**
 * `GET /cms/data?slug={slug}` - DataSource blocks only.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {RequestInit} [init]
 * @returns {Promise<ContentResponse>}
 */
export async function fetchDataSources(config, slug, init) {
  const response = await fetch(buildUrl(config, "/data", { slug }), {
    ...init,
    method: "GET",
    headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {ContentResponse} */ (await response.json());
}

/**
 * `PUT /cms/content` - admin save. `userSub` is the Keycloak `sub` claim
 * (informational header). `accessToken` is the full Keycloak JWT sent as
 * `Authorization: Bearer {token}` for backend signature verification.
 *
 * 409 Conflict surfaces as `CmsApiError` with `isConflict === true`.
 *
 * @param {CmsConfig} config
 * @param {string} userSub
 * @param {UpdatePageRequest} request
 * @param {string} [accessToken]
 * @returns {Promise<UpdatePageResponse>}
 */
export async function updateContent(config, userSub, request, accessToken) {
  if (!userSub) {
    throw new Error("updateContent: userSub is required for write requests");
  }
  /** @type {Record<string, string>} */
  const extraHeaders = { "X-User-Sub": userSub };
  if (accessToken) extraHeaders["Authorization"] = `Bearer ${accessToken}`;
  const response = await fetch(buildUrl(config, "/content"), {
    method: "PUT",
    headers: { ...baseHeaders(config), ...extraHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {UpdatePageResponse} */ (await response.json());
}

/**
 * `POST /cms/sync` - deploy pipeline only. Not called from end-user flows.
 *
 * @param {CmsConfig} config
 * @param {SyncManifestRequest} request
 * @param {string} [accessToken]  Service JWT from Keycloak client-credentials grant.
 * @returns {Promise<SyncResultResponse>}
 */
export async function syncManifest(config, request, accessToken) {
  /** @type {Record<string, string>} */
  const extraHeaders = accessToken ? { "Authorization": `Bearer ${accessToken}` } : {};
  const response = await fetch(buildUrl(config, "/sync"), {
    method: "POST",
    headers: { ...baseHeaders(config), ...extraHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {SyncResultResponse} */ (await response.json());
}

/**
 * `GET /cms/sources/{name}?{...query}` - resolve a single named data source.
 *
 * Filters and other query params are flattened into the URL string;
 * arrays / nested objects get JSON-encoded so the backend can
 * deserialise them on the other side. The response body is whatever
 * shape the source's resolver decided to return - typically an array
 * (events, news, members) or a single object (settings, hero card).
 *
 * @param {CmsConfig} config
 * @param {string} sourceName
 * @param {Record<string, *>} [query]
 * @param {RequestInit} [init]
 * @returns {Promise<*>}
 */
export async function fetchSource(config, sourceName, query, init) {
  const url = new URL(
    `${config.baseUrl}/cms/sources/${encodeURIComponent(sourceName)}`,
  );
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      if (raw == null) continue;
      const serialised =
        typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
          ? String(raw)
          : JSON.stringify(raw);
      url.searchParams.set(key, serialised);
    }
  }
  const response = await fetch(url.toString(), {
    ...init,
    method: "GET",
    headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await toApiError(response);
  return await response.json();
}