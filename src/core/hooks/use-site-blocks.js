"use client";

/**
 * @file The editor's read of the site, mounted once by `CmsProvider`.
 *
 * A visitor never fetches: the site arrived with the page and every route
 * renders from the store. An editor does, because only a request carrying their
 * credential comes back with `draftValue` and the versions a save is written
 * against.
 *
 * Once per session, not once per route. The read is keyed on the language, so a
 * navigation changes nothing it depends on and costs no request, which is what
 * makes an editor's navigation as immediate as a visitor's. A backend without
 * the whole-site read has no such option and falls back to reading the route it
 * is on, which is keyed on the route and so fetches per navigation as before.
 *
 * Re-runs when `refetchToken` changes, which is how a publish picks up the new
 * versions and how `refetch()` reaches a visitor's page.
 */

import { useEffect, useRef } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { readLanguage, readsWholeSite } from "../read-blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

export function useSiteBlocks() {
  const {
    config, isAdmin, uiStore, commitSite, commitSiteSlugs, setSiteStatus, getAccessToken,
  } = useCmsContext();
  const { slug, locale } = useCmsRoute();
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  // A visitor's page is already answered by the store; only an explicit
  // `refetch()` sends them to the backend.
  const shouldFetch = isAdmin || refetchToken > 0;
  // Null while the whole-site read is available, so a navigation moves no
  // dependency and fires no request. The fallback has to name the route, and
  // is keyed on it.
  const fallbackSlug = readsWholeSite(config) ? null : slug;
  // The route as it is when the read runs, read and never a trigger: on the
  // whole-site path nothing looks at it, and on the fallback path it is what
  // `fallbackSlug` already re-ran the effect for.
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    if (!shouldFetch) return undefined;
    let cancelled = false;
    // Aborts on unmount and on every re-run, so a language switch drops the
    // previous read instead of leaving it to finish unread.
    const controller = new AbortController();
    setSiteStatus(true, null);

    (async () => {
      try {
        const accessToken = await getAccessToken();
        const site = await readLanguage({
          config, slug: fallbackSlug ?? slugRef.current, locale, accessToken,
          signal: controller.signal,
        });
        if (cancelled) return;
        commitSite(site, locale);
        // Only the whole-site read knows every slug. The fallback read has one
        // page in its hands and would wipe the set down to it.
        if (fallbackSlug === null) commitSiteSlugs(site);
        setSiteStatus(false, null);
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[inscribed] site read failed:", err);
        // The store keeps the last good blocks: a transient failure surfaces as
        // `error` rather than blanking content the page is already showing.
        setSiteStatus(false, /** @type {Error} */ (err));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    shouldFetch, config, locale, fallbackSlug, refetchToken,
    commitSite, commitSiteSlugs, setSiteStatus, getAccessToken,
  ]);
}
