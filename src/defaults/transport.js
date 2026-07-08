/**
 * @file Default transport against the reference `/cms/*` REST API, wired in by
 * `createCmsConfig` when the caller injects no `transport`. The only place that
 * knows the concrete endpoints, headers, and `CmsApiError` mapping; swap it out
 * via `createCmsConfig({ transport })` (see the `CmsTransport` contract).
 *
 * No framework coupling. `uploadImage` is browser-only (`XMLHttpRequest`, for
 * progress events); every other method is `fetch`.
 */

import { CmsApiError, toApiError } from "../lib/errors.js";

/**
 * @import { CmsTransport, CmsRequestOptions } from "../lib/transport.js"
 * @import { CollectionListParams, CollectionItemResponse, PagedListResponse } from "../lib/schemas.js"
 */

/**
 * Build the default REST transport bound to a single backend.
 *
 * @param {{ baseUrl: string, cdnUrl?: string | null }} config
 * @returns {CmsTransport}
 */
export function createRestTransport({ baseUrl, cdnUrl = null }) {
  const base = baseUrl.replace(/\/+$/, "");
  const cdn = cdnUrl ? cdnUrl.replace(/\/+$/, "") : null;

  /**
   * Common headers + optional Bearer. A falsy token sends no Authorization.
   * No client/tenant header on purpose: the backend derives the tenant from
   * the credential (`azp`), and a client-settable header would invite spoofing.
   * @param {string | null | undefined} token
   * @returns {Record<string, string>}
   */
  const headers = (token) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  /**
   * Map the opaque `cache` hint onto Next.js' fetch extension. Returns an
   * empty object when no hint is given (plain browser/Node fetch).
   * @param {CmsRequestOptions["cache"]} [cache]
   */
  const cacheInit = (cache) =>
    cache ? { next: { revalidate: cache.revalidate ?? false, tags: cache.tags ?? [] } } : {};

  /**
   * @param {string} path  e.g. "/content"
   * @param {Record<string, string>} [params]
   */
  const url = (path, params) => {
    const u = new URL(`${base}/cms${path}`);
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  };

  return {
    async getContent(slug, opts = {}) {
      const res = await fetch(url("/content", { slug }), {
        method: "GET",
        headers: headers(opts.accessToken),
        signal: opts.signal,
        ...cacheInit(opts.cache),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async getCollection(key, params, opts = {}) {
      const u = new URL(`${base}/cms/collections/${encodeURIComponent(key)}`);
      if (params) {
        if (params.filter) {
          for (const [k, v] of Object.entries(params.filter)) {
            if (v == null) continue;
            u.searchParams.set(k, String(v));
          }
        }
        if (typeof params.offset === "number") u.searchParams.set("offset", String(params.offset));
        if (typeof params.limit === "number") u.searchParams.set("limit", String(params.limit));
      }
      const res = await fetch(u.toString(), {
        method: "GET",
        headers: headers(opts.accessToken),
        signal: opts.signal,
        ...cacheInit(opts.cache),
      });
      if (!res.ok) throw await toApiError(res);
      const body = await res.json();
      // Older backends return a raw array; coerce it to the paged shape so
      // downstream always sees one contract.
      if (Array.isArray(body)) {
        return /** @type {PagedListResponse<CollectionItemResponse>} */ ({
          items: body,
          total: body.length,
          offset: params?.offset ?? 0,
          limit: params?.limit ?? body.length,
        });
      }
      return /** @type {PagedListResponse<CollectionItemResponse>} */ (body);
    },

    async getCollectionItem(key, slug, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`,
        { method: "GET", headers: headers(opts.accessToken), signal: opts.signal },
      );
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async getMyCollections(opts = {}) {
      const res = await fetch(`${base}/cms/collections/me`, {
        method: "GET",
        headers: headers(opts.accessToken),
        signal: opts.signal,
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async updateContent(request, opts = {}) {
      const res = await fetch(url("/content"), {
        method: "PUT",
        headers: headers(opts.accessToken),
        body: JSON.stringify(request),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async updateDraft(request, opts = {}) {
      const res = await fetch(url("/draft"), {
        method: "PUT",
        headers: headers(opts.accessToken),
        body: JSON.stringify(request),
      });
      if (!res.ok) throw await toApiError(res);
    },

    async upsertCollectionItem(key, slug, payload, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`,
        { method: "PUT", headers: headers(opts.accessToken), body: JSON.stringify(payload) },
      );
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async createCollectionItem(key, payload, opts = {}) {
      const res = await fetch(`${base}/cms/collections/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: headers(opts.accessToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async saveCollectionItemDraft(key, slug, payload, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}/draft`,
        { method: "PUT", headers: headers(opts.accessToken), body: JSON.stringify(payload) },
      );
      if (!res.ok) throw await toApiError(res);
    },

    async saveCollectionNewDraft(key, payload, opts = {}) {
      const res = await fetch(`${base}/cms/collections/${encodeURIComponent(key)}/drafts`, {
        method: "POST",
        headers: headers(opts.accessToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await toApiError(res);
    },


    async syncManifests(manifests, opts = {}) {
      const res = await fetch(url("/sync"), {
        method: "POST",
        headers: headers(opts.accessToken),
        body: JSON.stringify(manifests),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    uploadImage(file, opts = {}) {
      const target = cdn ?? `${base}/cms/media`;
      const { onProgress, accessToken } = opts;
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const body = new FormData();
        body.append("file", file);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid JSON in upload response"));
            }
          } else {
            let detail = xhr.statusText || "Upload failed";
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (parsed?.detail) detail = parsed.detail;
            } catch { /* ignore */ }
            reject(new CmsApiError({ status: xhr.status, detail }));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

        xhr.open("POST", target);
        if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.send(body);
      });
    },
  };
}
