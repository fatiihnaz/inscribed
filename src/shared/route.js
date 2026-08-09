/**
 * @file Splitting a route into the locale it addresses and the slug the CMS
 * stores content under. Pure and React-free, so the server helper and the
 * client hook resolve a route through the same rule.
 *
 * The two strings are deliberately kept apart. `/about` and `/en/about` are
 * different routes but one slug: the client caches blocks per route, the wire
 * addresses them per slug. Collapsing them would make two locales share a cache
 * entry; conflating them the other way would PUT the English text onto a slug
 * the backend has never been synced with.
 */

/**
 * @import { CmsConfig } from "./config.js"
 */

/**
 * @typedef {Object} CmsRoute
 * @property {string} pathname   The route as Next.js sees it. Client cache key.
 * @property {string} slug       The manifest slug, locale prefix stripped. Wire identity.
 * @property {string|null} locale
 *   Null on a single-language site (`locales` unconfigured), which is what
 *   makes it send no locale at all and keep the pre-i18n wire shape.
 */

/**
 * Split a pathname into `{ locale, slug }`.
 *
 * A leading segment counts as a locale only when `config.locales` lists it, so
 * an unconfigured site, an unknown prefix (`/xx/about`) and a page that happens
 * to sit at `/en-masse` all keep their whole pathname as the slug.
 *
 * Prefix style needs no configuration: an unprefixed path resolves to the
 * default locale, which is exactly what "as-needed" routing means, and under
 * "always" routing such a path simply never arrives.
 *
 * @param {string | null | undefined} pathname
 * @param {CmsConfig | { locales?: string[], defaultLocale?: string|null }} [config]
 * @returns {CmsRoute}
 */
export function resolveCmsRoute(pathname, config) {
  const path = pathname || "/";
  const locales = config?.locales;
  if (!locales || locales.length === 0) {
    return { pathname: path, slug: path, locale: null };
  }

  const nextSlash = path.indexOf("/", 1);
  const head = nextSlash === -1 ? path.slice(1) : path.slice(1, nextSlash);
  if (!locales.includes(head)) {
    return { pathname: path, slug: path, locale: config?.defaultLocale ?? locales[0] };
  }

  const rest = nextSlash === -1 ? "" : path.slice(nextSlash);
  return { pathname: path, slug: rest || "/", locale: head };
}

/**
 * The inverse: the URL that shows `slug` in `locale`.
 *
 * The default locale sits at the root (`/about`), every other language behind
 * its prefix (`/en/about`). Only this direction needs that rule fixed:
 * `resolveCmsRoute` reads both styles without being told, but a link has to
 * commit to one, and a site cannot serve `/about` and `/tr/about` as separate
 * pages without one of them being a duplicate of the other.
 *
 * @param {string} slug
 * @param {string|null|undefined} locale
 * @param {CmsConfig | { defaultLocale?: string|null }} [config]
 * @returns {string}
 */
export function localizePath(slug, locale, config) {
  if (!locale || locale === config?.defaultLocale) return slug;
  return slug === "/" ? `/${locale}` : `/${locale}${slug}`;
}

/** Stable empty list, so callers can put the result straight in a dep array. */
const NO_LOCALES = /** @type {string[]} */ ([]);

/**
 * The configured languages other than the one being read, in config order.
 *
 * Empty on a single-language site and whenever no locale resolved, which is
 * what keeps every translation surface inert until `locales` is configured.
 *
 * @param {CmsConfig | { locales?: string[] }} [config]
 * @param {string|null|undefined} locale
 * @returns {string[]}
 */
export function otherLocales(config, locale) {
  const locales = config?.locales;
  if (!locales || locales.length < 2 || !locale) return NO_LOCALES;
  const rest = locales.filter((l) => l !== locale);
  return rest.length === 0 ? NO_LOCALES : rest;
}
