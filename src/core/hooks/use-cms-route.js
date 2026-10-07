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

import { useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { localizePath, matchCmsRoute } from "../../shared/route.js";

/**
 * @typedef {import("../../shared/route.js").CmsRoute & {
 *   localePath: (slug: string, locale?: string) => string,
 * }} UseCmsRouteResult
 *
 * `localePath` builds an href for a path, in the current language unless you
 * name another: `localePath("/about")` keeps the reader where they are,
 * `localePath(path, "en")` is a language switcher. `path`, not `slug`: on a
 * dynamic route the slug is the template the content is stored under. On a
 * collection record's page (its collection has an `seo.path`) the switch goes
 * to the record's translation, or that language's home when it has none.
 */

/**
 * @returns {UseCmsRouteResult}
 */
export function useCmsRoute() {
  const { config, slugsStore, registryStore } = useCmsContext();
  const pathname = usePathname() ?? "/";
  const slugs = useStoreSelector(slugsStore, (s) => s);
  const route = useMemo(
    () => matchCmsRoute(pathname, config, slugs),
    [pathname, config, slugs],
  );
  // A record has a slug per language, so the page on screen being one means
  // its other languages are other addresses, not the same path under another
  // prefix. One without a translation sends the switch to that language's home.
  // Only a component that has built a link listens for them: the many that just
  // read the route would otherwise all render again when a record registers.
  const buildsLinks = useRef(false);
  const languagePaths = useStoreSelector(
    registryStore,
    (s) => (buildsLinks.current ? pathsOfRoute(s.languagePaths, route) : null),
  );

  const localePath = useCallback(
    /** @param {string} slug @param {string} [locale] */
    (slug, locale) => {
      buildsLinks.current = true;
      const target = locale ?? route.locale;
      if (target && target !== route.locale && slug === route.path) {
        // Read now too: on its first render a component has not asked yet, so
        // its subscription holds nothing.
        const paths = languagePaths ?? pathsOfRoute(registryStore.get().languagePaths, route);
        if (paths) return localizePath(paths[target] ?? "/", target, config);
      }
      return localizePath(slug, target, config);
    },
    [route, config, languagePaths, registryStore],
  );

  return useMemo(() => ({ ...route, localePath }), [route, localePath]);
}

/**
 * @param {Map<string, Record<string, string>>} registered
 * @param {{ path: string, locale: string|null }} route
 * @returns {Record<string, string> | null}
 */
function pathsOfRoute(registered, route) {
  if (!route.locale) return null;
  for (const paths of registered.values()) {
    if (paths[route.locale] === route.path) return paths;
  }
  return null;
}
