"use client";

/**
 * @file `useCmsContent()`: the current page's blocks, as the page sees them.
 *
 * A reader, not a fetcher. The site is read once per session by the provider
 * (see `useSiteBlocks`), so this resolves against the store and returns what is
 * already there; `refetch()` asks the provider to read again.
 *
 * "As the page sees them" is the route's own blocks plus the language's
 * globals, which live in a separate store entry. A route the site has nothing
 * for still has its globals, which is what makes a header the same everywhere.
 */

import { useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
import { globalsKey, routeKey } from "../../shared/route.js";
import { mergeRouteBlocks } from "../blocks.js";
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
  const { blocksStore, uiStore, triggerRefetch } = useCmsContext();
  const { slug, locale } = useCmsRoute();
  const key = routeKey(slug, locale);
  const globals = globalsKey(locale);

  // Two entries, selected separately: a selector has to return a stable
  // reference, and merging them is an allocation. The memo below is where that
  // belongs.
  const own = useStoreSelector(blocksStore, (s) => s.get(key) ?? EMPTY_BLOCKS);
  const globalBlocks = useStoreSelector(blocksStore, (s) => s.get(globals) ?? EMPTY_BLOCKS);
  const blocks = useMemo(
    () => [...mergeRouteBlocks(own, globalBlocks).values()],
    [own, globalBlocks],
  );

  const isLoading = useStoreSelector(uiStore, (s) => s.siteLoading);
  const error = useStoreSelector(uiStore, (s) => s.siteError);

  return { blocks, isLoading, error, refetch: triggerRefetch, slug };
}
