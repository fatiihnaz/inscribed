"use client";

/**
 * @file `useCmsRoute()`: the active route, split into the pathname, the slug
 * the backend stores content under, and the language. Every surface that used
 * to call `usePathname()` for itself reads this instead, so the store key and
 * the wire identity can't drift apart one call site at a time.
 *
 * The slug is matched, not just derived: the site's slugs are in context, so a
 * concrete path under a dynamic segment (`/news/123`) resolves to the manifest
 * template (`/news/[id]`) that holds its content.
 *
 * Also the app's own answer to "which language am I in": it reads the locale
 * list off the config already in context, so a page has nothing to re-declare
 * and no second copy of the list to keep in step.
 */

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { localizePath, matchCmsRoute } from "../../shared/route.js";

/**
 * @typedef {import("../../shared/route.js").CmsRoute & {
 *   localePath: (slug: string, locale?: string) => string,
 * }} UseCmsRouteResult
 *
 * `localePath` builds an href for `slug`, in the current language unless you
 * name another: `localePath("/about")` keeps the reader where they are,
 * `localePath(slug, "en")` is a language switcher.
 */

/**
 * @returns {UseCmsRouteResult}
 */
export function useCmsRoute() {
  const { config, slugsStore } = useCmsContext();
  const pathname = usePathname() ?? "/";
  const slugs = useStoreSelector(slugsStore, (s) => s);
  const route = useMemo(
    () => matchCmsRoute(pathname, config, slugs),
    [pathname, config, slugs],
  );

  const localePath = useCallback(
    /** @param {string} slug @param {string} [locale] */
    (slug, locale) => localizePath(slug, locale ?? route.locale, config),
    [route.locale, config],
  );

  return useMemo(() => ({ ...route, localePath }), [route, localePath]);
}
