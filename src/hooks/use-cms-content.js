"use client";

/**
 * @file `useCmsContent()`: fetch the current page's blocks. Slug comes from
 * `usePathname()`. The result also lands in the shared `CmsContext` blocks map
 * so `useCmsBlock` / `EditableRegion` read it without their own fetches.
 * Re-runs when `refetchToken` changes (bumped by saves).
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsApiError } from "../lib/errors.js";
import { indexBlocksByPath } from "../lib/blocks.js";

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

  // Seed from the provider's blocks store (set from `initialBlocks` on the
  // server) so the first render shows SSR content, not an empty array while
  // the admin-only refetch is in flight.
  const [state, setState] = useState(
    /** @returns {{ blocks: BlockResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ blocks: Array.from((blocksStore.get().get(slug) ?? new Map()).values()), isLoading: false, error: null }),
  );

  useEffect(() => {
    let cancelled = false;
    // Aborts on unmount and on every re-run, so a fast navigation drops the
    // previous page's requests instead of leaving them to finish unread. This
    // hook owns them outright, unlike the collection fetchers, whose in-flight
    // table is shared between consumers.
    const controller = new AbortController();
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        const token = await getAccessToken();

        // Refetch page + global slug in parallel so a header/footer save shows
        // on every page. Each block is stamped with its source slug for the
        // save layer.
        const globalSlug = config.globalSlug && config.globalSlug !== slug
          ? config.globalSlug
          : null;

        const [pageResponse, globalResponse] = await Promise.all([
          config.transport.getContent(slug, { accessToken: token, signal: controller.signal }),
          globalSlug
            ? config.transport
                .getContent(globalSlug, { accessToken: token, signal: controller.signal })
                .catch(() => ({ slug: globalSlug, blocks: [] }))
            : Promise.resolve({ slug: "", blocks: [] }),
        ]);
        if (cancelled) return;

        const pageBlocks = pageResponse.blocks.map((b) => ({ ...b, _slug: slug }));
        const pagePaths = new Set(pageBlocks.map((b) => b.blockPath));
        const globalBlocks = globalSlug
          ? globalResponse.blocks
              .filter((b) => !pagePaths.has(b.blockPath))
              .map((b) => ({ ...b, _slug: globalSlug }))
          : [];

        const merged = [...pageBlocks, ...globalBlocks];
        commitBlocks(slug, indexBlocksByPath(merged));
        setState({ blocks: merged, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[inscribed] fetchContent failed:", err);
        setState({ blocks: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [config, slug, refetchToken, commitBlocks, getAccessToken]);

  return {
    blocks: state.blocks,
    isLoading: state.isLoading,
    error: state.error,
    refetch: triggerRefetch,
    slug,
  };
}