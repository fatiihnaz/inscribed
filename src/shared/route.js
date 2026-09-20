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

/**
 * The key one route's blocks live under in the client store: the slug, and the
 * language when the site has one. Two languages of a page are two entries, so
 * a staged translation can be versioned against the row it will overwrite.
 *
 * U+001E (record separator) joins them because a slug is user-shaped and can
 * hold any printable character; a locale never holds a control character.
 *
 * @param {string} slug
 * @param {string|null|undefined} locale
 * @returns {string}
 */
export function routeKey(slug, locale) {
  return locale ? `${locale}${slug}` : slug;
}

/**
 * @param {string} key
 * @returns {{ slug: string, locale: string|null }}
 */
export function parseRouteKey(key) {
  const i = key.indexOf("");
  if (i === -1) return { slug: key, locale: null };
  return { locale: key.slice(0, i), slug: key.slice(i + 1) };
}

/**
 * Resolve a pathname to the slug the backend actually stores content under.
 *
 * `resolveCmsRoute` only strips the locale; this also matches a concrete path
 * against the dynamic-segment slugs the manifest holds, so `/news/123` finds
 * `/news/[id]` without the page having to say so. Precedence follows Next:
 * an exact slug wins, then the template with the fewest dynamic segments, and
 * a catch-all loses to anything more specific.
 *
 * @param {string | null | undefined} pathname
 * @param {CmsConfig | { locales?: string[], defaultLocale?: string|null }} [config]
 * @param {Iterable<string>} [slugs]   Every slug the site has content for.
 * @returns {CmsRoute}
 */
export function matchCmsRoute(pathname, config, slugs) {
  const route = resolveCmsRoute(pathname, config);
  if (!slugs) return route;
  const matched = matchSlugTemplate(route.slug, slugs);
  return matched === route.slug ? route : { ...route, slug: matched };
}

/**
 * @param {string} path   A slug-shaped path, locale already stripped.
 * @param {Iterable<string>} slugs
 * @returns {string}   The matching template, or `path` itself when none does.
 */
export function matchSlugTemplate(path, slugs) {
  const list = slugs instanceof Set ? slugs : new Set(slugs);
  if (list.has(path)) return path;
  const segments = path.split("/").filter(Boolean);

  /** @type {{ slug: string, rank: number } | null} */
  let best = null;
  for (const slug of list) {
    if (!slug.includes("[")) continue;
    const rank = rankTemplate(slug, segments);
    if (rank === null) continue;
    if (!best || rank < best.rank || (rank === best.rank && slug < best.slug)) {
      best = { slug, rank };
    }
  }
  return best ? best.slug : path;
}

/**
 * How well a template fits, lower being more specific, or null for no fit.
 * Dynamic segments cost one each; a catch-all costs enough to lose to any
 * template made of single segments alone.
 *
 * @param {string} template
 * @param {string[]} segments
 * @returns {number|null}
 */
function rankTemplate(template, segments) {
  const parts = template.split("/").filter(Boolean);
  let rank = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const optionalCatchAll = /^\[\[\.\.\..+\]\]$/.test(part);
    const catchAll = optionalCatchAll || /^\[\.\.\..+\]$/.test(part);
    if (catchAll) {
      // Only ever the last segment, and it eats the rest of the path.
      if (i !== parts.length - 1) return null;
      const rest = segments.length - i;
      if (rest < (optionalCatchAll ? 0 : 1)) return null;
      return rank + 1000;
    }
    if (i >= segments.length) return null;
    if (/^\[.+\]$/.test(part)) {
      rank += 1;
      continue;
    }
    if (part !== segments[i]) return null;
  }
  return parts.length === segments.length ? rank : null;
}
