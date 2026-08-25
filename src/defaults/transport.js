/**
 * @file Default transport against the reference `/cms/*` REST API, wired in by
 * `createCmsConfig` when the caller injects no `transport`. The only place that
 * knows the concrete endpoints, headers, and `CmsApiError` mapping; swap it out
 * via `createCmsConfig({ transport })` (see the `CmsTransport` contract).
 *
 * No framework coupling. `uploadImage` is browser-only (`XMLHttpRequest`, for
 * progress events); every other method is `fetch`.
 */

import { CmsApiError, toApiError } from "../shared/contracts/errors.js";

/**
 * @import { CmsTransport, CmsRequestOptions } from "../shared/contracts/transport.js"
 * @import { CollectionListParams, CollectionListResponse, CollectionItemResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Build the default REST transport bound to a single backend.
 *
 * @param {{ baseUrl: string, cdnUrl?: string | null, clientKey?: string | null }} config
 * @returns {CmsTransport}
 */
export function createRestTransport({ baseUrl, cdnUrl = null, clientKey = null }) {
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
   * `locale` is a query parameter on every localized endpoint, writes included:
   * it says which language the call addresses rather than describing the
   * payload, so keeping it in one channel means the backend reads it the same
   * way on a GET and a PUT, and no request body shape had to change.
   *
   * Omitted when the caller has no locale, which is how a single-language site
   * keeps the pre-i18n wire and lets the backend apply its default.
   *
   * @param {URL} u
   * @param {CmsRequestOptions} [opts]
   * @returns {string}
   */
  const withLocale = (u, opts) => {
    if (opts?.locale) u.searchParams.set("locale", opts.locale);
    return u.toString();
  };

  /**
   * Same channel as the locale, for the same reason: which group a new record
   * joins qualifies the call rather than describing the record, so the payload
   * shape stays identical whether or not translations are in play.
   *
   * @param {URL} u
   * @param {{ locale?: string, translationGroup?: string }} [opts]
   * @returns {string}
   */
  const withLocaleAndGroup = (u, opts) => {
    if (opts?.translationGroup) u.searchParams.set("translationGroup", opts.translationGroup);
    return withLocale(u, opts);
  };

  /**
   * @param {string} path  e.g. "/content"
   * @param {Record<string, string>} [params]
   * @param {CmsRequestOptions} [opts]  Pass to carry the locale; omit on locale-agnostic endpoints (`/sync`).
   */
  const url = (path, params, opts) => {
    const u = new URL(`${base}/cms${path}`);
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return withLocale(u, opts);
  };

  return {
    async getContent(slug, opts = {}) {
      // `/cms/content` needs a credential and branches on it: callers without
      // `content:write` get no `draftValue`. Tokenless reads fall back to the
      // public endpoint, available when the client's `allowAnonymousContentRead`
      // flag is on (404 otherwise).
      const target =
        !opts.accessToken && clientKey
          ? url(`/public/${encodeURIComponent(clientKey)}/content`, { slug }, opts)
          : url("/content", { slug }, opts);
      const res = await fetch(target, {
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
        // Locale rides in `params` here, not `opts`, because for a list it
        // narrows the window like any filter does: `params` is what forms the
        // client's cache key, so a locale outside it would let two languages
        // collide in one entry.
        if (params.locale) u.searchParams.set("locale", params.locale);
        if (params.sort) u.searchParams.set("sort", params.sort);
        if (typeof params.archived === "boolean") {
          u.searchParams.set("archived", String(params.archived));
        }
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
      // downstream always sees one contract. No `virtualItems` either way:
      // absent means none, which is what such a backend has.
      if (Array.isArray(body)) {
        return /** @type {CollectionListResponse} */ ({
          items: body,
          total: body.length,
          offset: params?.offset ?? 0,
          limit: params?.limit ?? body.length,
        });
      }
      return /** @type {CollectionListResponse} */ (body);
    },

    async getCollectionItem(key, slug, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`,
        {
          method: "GET",
          headers: headers(opts.accessToken),
          signal: opts.signal,
          ...cacheInit(opts.cache),
        },
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
      const res = await fetch(url("/content", undefined, opts), {
        method: "PUT",
        headers: headers(opts.accessToken),
        body: JSON.stringify(request),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    async updateDraft(request, opts = {}) {
      const res = await fetch(url("/draft", undefined, opts), {
        method: "PUT",
        headers: headers(opts.accessToken),
        body: JSON.stringify(request),
      });
      if (!res.ok) throw await toApiError(res);
    },

    // Idempotent (204, no-op on a missing draft): unlike an echo-PUT of the
    // published value, this can't race a concurrent publish into creating a
    // stale draft, so discard flows should always prefer this over echoing.
    async deleteDraft(slug, opts = {}) {
      const res = await fetch(url("/draft", { slug }, opts), {
        method: "DELETE",
        headers: headers(opts.accessToken),
      });
      if (!res.ok) throw await toApiError(res);
    },

    // Carries the locale even though a slug already names one row, because this
    // endpoint has a create branch: `version: null` is how a ClaimDerived or
    // UserDefined collection makes its first row at a slug, and that row has no
    // language yet. The backend reads it only on that branch; on an update the
    // slug has already decided.
    async upsertCollectionItem(key, slug, payload, opts = {}) {
      const target = withLocale(
        new URL(`${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`),
        opts,
      );
      const res = await fetch(
        target,
        { method: "PUT", headers: headers(opts.accessToken), body: JSON.stringify(payload) },
      );
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    // Locale says which language the new row is written in. The per-slug
    // endpoints that only ever address an existing row need none: a slug is
    // unique across the whole collection, so it already names exactly one row
    // in exactly one language.
    async createCollectionItem(key, payload, opts = {}) {
      const target = withLocaleAndGroup(
        new URL(`${base}/cms/collections/${encodeURIComponent(key)}`), opts,
      );
      const res = await fetch(target, {
        method: "POST",
        headers: headers(opts.accessToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    // Archiving is a state change, not a delete: the row and its slug stay, and
    // the version rides along only to prove the caller saw the current content.
    // It is not consumed, so the same number restores and publishes afterwards.
    async archiveCollectionItem(key, slug, version, opts = {}) {
      const target = new URL(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`,
      );
      target.searchParams.set("version", String(version));
      const res = await fetch(target.toString(), {
        method: "DELETE",
        headers: headers(opts.accessToken),
      });
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    // No version: archiving leaves the content untouched, so there is nothing
    // for a restore to disagree with.
    async restoreCollectionItem(key, slug, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}/restore`,
        { method: "POST", headers: headers(opts.accessToken) },
      );
      if (!res.ok) throw await toApiError(res);
      return /** @type {*} */ (await res.json());
    },

    // No locale: the slug being left behind already names one row in one
    // language, and the new slug inherits it. `replaceAlias` rides in the query
    // string because it qualifies the request (force past an alias) rather than
    // describing the record being written.
    async renameCollectionItem(key, slug, payload, opts = {}) {
      const target = new URL(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}/slug`,
      );
      if (opts.replaceAlias) target.searchParams.set("replaceAlias", "true");
      const res = await fetch(target.toString(), {
        method: "PUT",
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

    async deleteCollectionItemDraft(key, slug, opts = {}) {
      const res = await fetch(
        `${base}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}/draft`,
        { method: "DELETE", headers: headers(opts.accessToken) },
      );
      if (!res.ok) throw await toApiError(res);
    },

    // The new-item slot is per locale: composing a Turkish record and an
    // English one are two drafts, not one being overwritten twice.
    async saveCollectionNewDraft(key, payload, opts = {}) {
      const target = withLocaleAndGroup(
        new URL(`${base}/cms/collections/${encodeURIComponent(key)}/drafts`), opts,
      );
      const res = await fetch(target, {
        method: "POST",
        headers: headers(opts.accessToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await toApiError(res);
    },

    async deleteCollectionNewDraft(key, opts = {}) {
      const target = withLocale(
        new URL(`${base}/cms/collections/${encodeURIComponent(key)}/drafts`), opts,
      );
      const res = await fetch(target, {
        method: "DELETE",
        headers: headers(opts.accessToken),
      });
      if (!res.ok) throw await toApiError(res);
    },

    // `?locales=` (plural) rather than the `?locale=` every other endpoint
    // carries: this call doesn't address one language, it declares which ones
    // exist. The manifest itself stays locale-free, because a slug is what a
    // page is and the language is not part of that.
    async syncManifests(manifests, opts = {}) {
      const target = new URL(`${base}/cms/sync`);
      if (opts.locales?.length) target.searchParams.set("locales", opts.locales.join(","));
      const res = await fetch(target.toString(), {
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

    async request(path, init = {}) {
      const { accessToken, headers: extraHeaders, ...rest } = init;
      // Resolved against `baseUrl` itself, without the `/cms` prefix the other
      // methods carry: those address the CMS API, while this exists for the
      // endpoints an app puts on the same backend beside it.
      const target = ABSOLUTE_URL.test(path)
        ? path
        : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
      const res = await fetch(target, {
        ...rest,
        headers: { ...headers(accessToken), ...extraHeaders },
      });
      if (!res.ok) throw await toApiError(res);
      // A 204 and an empty 200 both mean "nothing came back", and `res.json()`
      // throws on either: the caller asked for a result, not a parse error.
      if (res.status === 204) return null;
      const body = await res.text();
      return body ? JSON.parse(body) : null;
    },
  };
}

const ABSOLUTE_URL = /^https?:\/\//i;
