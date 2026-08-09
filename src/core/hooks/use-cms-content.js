"use client";

/**
 * @file `useCmsContent()`: fetch the current page's blocks. The route comes from
 * `useCmsRoute()`, which is also what keeps the cache keyed by pathname while
 * the fetch addresses the slug. The result lands in the shared `CmsContext`
 * blocks map so `useCmsBlock` / `EditableRegion` read it without their own
 * fetches. Re-runs when `refetchToken` changes (bumped by saves).
 */

import { useEffect, useMemo, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
import { indexBlocksByPath } from "../blocks.js";
import { fetchRouteBlocks } from "../fetch-route-blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

/** Stable empty map so the selector never allocates (see shared/state/store.js). */
const EMPTY_BLOCKS = new Map();

/**
 * @import { BlockResponse } from "../../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} UseCmsContentResult
 * @property {BlockResponse[]} blocks       Current page's blocks (array form).
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => void} refetch
 * @property {string} slug
 */

/**
 * @returns {UseCmsContentResult}
 */

export function useCmsContent() {
  const { config, blocksStore, commitBlocks, uiStore, triggerRefetch, getAccessToken } = useCmsContext();
  const { pathname, slug, locale } = useCmsRoute();
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  // Blocks come straight off the store rather than a local copy: the same map
  // is written by the SSR seed, by navigation, and by the autosave mirror, and
  // a local array would silently miss all three (this hook is public API).
  const byPath = useStoreSelector(blocksStore, (s) => s.get(pathname) ?? EMPTY_BLOCKS);
  const blocks = useMemo(() => Array.from(byPath.values()), [byPath]);

  const [state, setState] = useState(
    /** @returns {{ isLoading: boolean, error: Error|null }} */
    () => ({ isLoading: false, error: null }),
  );

  useEffect(() => {
    let cancelled = false;
    // Aborts on unmount and on every re-run, so a fast navigation drops the
    // previous page's requests instead of leaving them to finish unread. This
    // hook owns them outright, unlike the collection fetchers, whose in-flight
    // table is shared between consumers.
    const controller = new AbortController();
    setState({ isLoading: true, error: null });

    (async () => {
      try {
        const token = await getAccessToken();

        const merged = await fetchRouteBlocks({
          config, slug, locale, accessToken: token, signal: controller.signal,
        });
        if (cancelled) return;

        // Keyed by pathname, not slug: two locales share one slug, and the
        // store is what each route renders from.
        commitBlocks(pathname, indexBlocksByPath(merged));
        setState({ isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[inscribed] fetchContent failed:", err);
        // The store keeps the last good blocks: a transient failure surfaces as
        // `error` rather than blanking content the page is already showing.
        setState({ isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [config, pathname, slug, locale, refetchToken, commitBlocks, getAccessToken]);

  return {
    blocks,
    isLoading: state.isLoading,
    error: state.error,
    refetch: triggerRefetch,
    slug,
  };
}