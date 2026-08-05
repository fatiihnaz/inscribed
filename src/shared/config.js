/**
 * @file SDK configuration factory. Read by both server helpers and client
 * hooks, so the shape stays serializable and free of browser-only types,
 * letting it cross the RSC boundary as a prop. `transport` holds functions
 * and so is resolved at the use site rather than stored here.
 */

/**
 * @import { CmsTransport } from "./contracts/transport.js"
 * @import { ServiceTokenProvider } from "./contracts/service-token.js"
 * @import { CmsTheme } from "./style/theme.js"
 */

import { normalizeTheme } from "./style/theme.js";

/**
 * @typedef {Object} CmsConfig
 * @property {string} baseUrl                  Backend root, no trailing slash.
 * @property {string|null} cdnUrl              CDN root for image uploads. When null, uploads fall back to `${baseUrl}/cms/media`.
 * @property {string|null} clientKey
 *   This site's Client key on the reference backend (`azp` in its tokens).
 *   Enables the anonymous published-content endpoint and, when the consumer
 *   supplies no `getAccessToken`, the built-in browser auth. Not a trust
 *   input: the backend derives identity from credentials, never from this.
 * @property {string} globalSlug
 *   Slug holding `scope="global"` blocks (header/footer/site-wide). Fetched
 *   alongside every page and merged into the same blocks map. Default "__global".
 * @property {string[]} locales
 *   Locale codes this site serves, matched against the leading path segment to
 *   split a route into `{ locale, slug }` (see `route.js`). Empty on a
 *   single-language site, which is what keeps it off the wire entirely.
 *
 *   **Order is meaningful: the first entry is the default locale.** List the
 *   language your existing content is already written in first.
 * @property {string|null} defaultLocale
 *   Derived, not configured: `locales[0]`, or null when `locales` is empty.
 *   The locale an unprefixed path resolves to, and the one whose links carry no
 *   prefix. It is not a separate input because the backend derives its own the
 *   same way, and two inputs are two things that can disagree.
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
 * @param {string} [opts.clientKey]   This site's Client key on the reference backend. Omit to disable public content reads and the built-in auth.
 * @param {string} [opts.globalSlug]   Override the default "__global" slug for cross-page blocks.
 * @param {string[]} [opts.locales]   Locale codes this site serves, e.g. `["tr", "en"]`. The first is the default. Omit for a single-language site.
 * @param {CmsTheme} [opts.theme]   Overrides for the admin/editing visual tokens (accent, fonts, radius, …). Unknown keys are dropped; unset keys keep their defaults.
 * @returns {CmsConfig}
 */

export function createCmsConfig({
  baseUrl,
  cdnUrl,
  clientKey,
  globalSlug,
  locales,
  theme,
  ...rest
}) {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("createCmsConfig: baseUrl is required");
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedLocales = normalizeLocales(locales);
  // This has to tolerate seeing its own output again: `ensureCmsConfig`
  // re-normalizes any config that isn't frozen, and crossing the RSC boundary
  // drops the freeze, so the client re-runs this over a config that already
  // carries the derived `defaultLocale`. A value agreeing with the derivation
  // is therefore a round-trip, not an input; only a disagreeing one is the
  // mistake worth naming, and ignoring that would move the site's root
  // language without saying so.
  if (rest.defaultLocale != null && rest.defaultLocale !== normalizedLocales[0]) {
    throw new Error(
      `createCmsConfig: defaultLocale is not an option, and "${rest.defaultLocale}" is not the first entry of locales [${normalizedLocales.join(", ")}]. The first entry is the default; order that list instead.`,
    );
  }
  return Object.freeze({
    baseUrl: normalizedBase,
    cdnUrl: cdnUrl ? cdnUrl.replace(/\/+$/, "") : null,
    clientKey: clientKey ?? null,
    globalSlug: globalSlug ?? "__global",
    locales: normalizedLocales,
    defaultLocale: normalizedLocales[0] ?? null,
    theme: normalizeTheme(theme),
  });
}

/**
 * Validate eagerly rather than at the first fetch: a typo'd locale otherwise
 * surfaces as a page of placeholders, several layers away from the config that
 * caused it.
 *
 * @param {string[] | undefined} locales
 * @returns {string[]}
 */
function normalizeLocales(locales) {
  if (locales == null) return Object.freeze([]);
  if (!Array.isArray(locales) || locales.some((l) => typeof l !== "string" || l === "")) {
    throw new Error("createCmsConfig: locales must be an array of non-empty strings");
  }
  return Object.freeze([...locales]);
}

/**
 * Accept either an already-normalized config or a plain options object.
 *
 * Normalizing matters beyond tidiness: a plain `{ baseUrl }` literal has no
 * `globalSlug`, so the caller would skip the `__global` fetch and every page
 * would render its header/footer as placeholders.
 *
 * @param {CmsConfig | Object} config
 * @returns {CmsConfig}
 */
export function ensureCmsConfig(config) {
  return "baseUrl" in config && Object.isFrozen(config)
    ? /** @type {CmsConfig} */ (config)
    : createCmsConfig(/** @type {*} */ (config));
}