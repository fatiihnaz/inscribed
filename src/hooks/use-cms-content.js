"use client";

/**
 * @file `useCmsContent()`: fetch the current page's blocks. Slug comes from
 * `usePathname()`. The result also lands in the shared `CmsContext` blocks map
 * so `useCmsBlock` / `EditableRegion` read it without their own fetches.
 * Re-runs when `refetchToken` changes (bumped by saves).
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsApiError } from "../lib/errors.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { mergePageBlocks, resolveGlobalSlug } from "../lib/merge-blocks.js";

/** Stable empty map so the selector never allocates (see lib/store.js). */
const EMPTY_BLOCKS = new Map();

/**
 * @import { BlockResponse } from "../lib/schemas.js"
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
  const slug = usePathname() ?? "/";
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  // Blocks come straight off the store rather than a local copy: the same map
  // is written by the SSR seed, by navigation, and by the autosave mirror, and
  // a local array would silently miss all three (this hook is public API).
  const byPath = useStoreSelector(blocksStore, (s) => s.get(slug) ?? EMPTY_BLOCKS);
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

        // Refetch page + global slug in parallel so a header/footer save shows
        // on every page.
        const globalSlug = resolveGlobalSlug(config.globalSlug, slug);

        const [pageResponse, globalResponse] = await Promise.all([
          config.transport.getContent(slug, { accessToken: token, signal: controller.signal }),
          globalSlug
            ? config.transport
                .getContent(globalSlug, { accessToken: token, signal: controller.signal })
                .catch(() => ({ slug: globalSlug, blocks: [] }))
            : Promise.resolve({ slug: "", blocks: [] }),
        ]);
        if (cancelled) return;

        const merged = mergePageBlocks({
          slug,
          globalSlug,
          pageBlocks: pageResponse.blocks,
          globalBlocks: globalResponse.blocks,
        });
        commitBlocks(slug, indexBlocksByPath(merged));
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
  }, [config, slug, refetchToken, commitBlocks, getAccessToken]);

  return {
    blocks,
    isLoading: state.isLoading,
    error: state.error,
    refetch: triggerRefetch,
    slug,
  };
}