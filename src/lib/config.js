/**
 * @file SDK configuration factory. Read by both server helpers and client
 * hooks, so the shape stays serializable and free of browser-only types,
 * letting it cross the RSC boundary as a prop. `transport` holds functions
 * and so is resolved at the use site rather than stored here.
 */

/**
 * @import { CmsTransport } from "./transport.js"
 * @import { ServiceTokenProvider } from "./service-token.js"
 * @import { CmsTheme } from "./theme.js"
 */

import { normalizeTheme } from "./theme.js";

/**
 * @typedef {Object} CmsConfig
 * @property {string} baseUrl                  Backend root, no trailing slash.
 * @property {string|null} cdnUrl              CDN root for image uploads. When null, uploads fall back to `${baseUrl}/cms/media`.
 * @property {string|null} clientId            X-CMS-Client-Id header value.
 * @property {string} globalSlug
 *   Slug holding `scope="global"` blocks (header/footer/site-wide). Fetched
 *   alongside every page and merged into the same blocks map. Default "__global".
 * @property {CmsTransport} [transport]
 *   Data-access seam (see `transport.js`). Added at the use site, not by
 *   `createCmsConfig`: client provider augments it, server helpers default
 *   it to the REST adapter.
 * @property {ServiceTokenProvider} [getServiceToken]
 *   Server-only seam (see `service-token.js`). May hold secrets, so it never
 *   crosses to the client. Added by `createCmsPage`; defaults to no token.
 * @property {CmsTheme|null} theme
 *   Overridable visual tokens (see `theme.js`), emitted as CSS custom
 *   properties by `CmsProvider`. Null when no overrides given.
 */

/**
 * Normalize and freeze a serializable config object.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} [opts.cdnUrl]   Image upload root. Omit to upload through the API at `${baseUrl}/cms/media`.
 * @param {string} [opts.clientId]
 * @param {string} [opts.globalSlug]   Override the default "__global" slug for cross-page blocks.
 * @param {CmsTheme} [opts.theme]   Overrides for the admin/editing visual tokens (accent, fonts, radius, …). Unknown keys are dropped; unset keys keep their defaults.
 * @returns {CmsConfig}
 */

export function createCmsConfig({ baseUrl, cdnUrl, clientId, globalSlug, theme }) {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("createCmsConfig: baseUrl is required");
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return Object.freeze({
    baseUrl: normalizedBase,
    cdnUrl: cdnUrl ? cdnUrl.replace(/\/+$/, "") : null,
    clientId: clientId ?? null,
    globalSlug: globalSlug ?? "__global",
    theme: normalizeTheme(theme),
  });
}