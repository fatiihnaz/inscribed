"use client";

/**
 * @file `useCmsTranslations(block, { enabled })`: the other languages' copies of
 * one block, ready to edit.
 *
 * The fetched blocks land in `blocksStore` under the **other language's real
 * pathname** (`/en/haber-lab`), not a private cache. That route is one the app
 * genuinely has, so the fetch doubles as a warm cache for navigating there, and
 * a card that opens second reads what the first one already pulled. It commits
 * the page + global merge rather than the page alone, because a partial entry
 * would show as a frame of missing header blocks the moment someone did
 * navigate: `blocksStore` is what a route renders from before its own fetch
 * lands.
 *
 * Drafts typed here are **not** autosaved. They live in
 * `translationDraftsStore` from the moment the drawer offers them until the
 * next publish carries them, and a navigation drops them. A half-typed
 * translation has no business becoming a server draft another editor sees in a
 * language nobody is reviewing.
 */

import { useEffect, useMemo, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { localizePath, otherLocales as resolveOtherLocales } from "../../shared/route.js";
import { translationDraftKey } from "../../shared/state/draft-keys.js";
import { indexBlocksByPath } from "../blocks.js";
import { fetchRouteBlocks } from "../fetch-route-blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { BlockResponse } from "../../shared/contracts/schemas.js"
 */

/** @type {Map<string, BlockResponse>} */
const EMPTY_BLOCKS = new Map();

/**
 * Which languages have already been pulled, and which pulls are on the wire.
 *
 * This is per provider, not per card. Every card that trips the prompt wants
 * the same page in the same languages, so without a shared record three dirty
 * blocks would fetch `/en` three times: `inFlight` alone only merges requests
 * that overlap in time, and the second block is usually rewritten after the
 * first one's fetch has landed.
 *
 * Keyed by `blocksStore` because that is the one object whose lifetime is
 * exactly the provider's. Keying by `config` looked equivalent and is not: a
 * frozen config outlives a remount, so a fresh provider would find `fetchedAt`
 * already claiming token 0 was pulled and skip the fetch its empty store needs.
 *
 * @type {WeakMap<object, {
 *   inFlight: Map<string, Promise<BlockResponse[]>>,
 *   fetchedAt: Map<string, number>,
 * }>}
 */
const routeCache = new WeakMap();

/**
 * @param {object} store
 */
function cacheFor(store) {
  let entry = routeCache.get(store);
  if (!entry) {
    entry = { inFlight: new Map(), fetchedAt: new Map() };
    routeCache.set(store, entry);
  }
  return entry;
}

/**
 * @param {{ inFlight: Map<string, Promise<BlockResponse[]>> }} cache
 * @param {string} pathname
 * @param {() => Promise<BlockResponse[]>} run
 * @returns {Promise<BlockResponse[]>}
 */
function dedupe(cache, pathname, run) {
  const existing = cache.inFlight.get(pathname);
  if (existing) return existing;
  const promise = run().finally(() => {
    if (cache.inFlight.get(pathname) === promise) cache.inFlight.delete(pathname);
  });
  cache.inFlight.set(pathname, promise);
  return promise;
}

/**
 * @typedef {Object} TranslationTarget
 * @property {string} locale
 * @property {string} pathname   The route this language's copy lives at.
 * @property {string} key        `translationDraftKey(pathname, blockPath)`.
 * @property {BlockResponse|null} block  Null until the fetch lands, or when
 *   this language has no row for the path.
 * @property {*} value           The staged edit, else the published value.
 * @property {boolean} hasDraft
 * @property {(value: *) => void} setValue
 * @property {() => void} reset  Drop the staged edit.
 */

/**
 * @typedef {Object} UseCmsTranslationsResult
 * @property {TranslationTarget[]} targets  Empty on a single-language site.
 * @property {boolean} isReady
 *   Whether every target has been answered for, one way or the other. A surface
 *   that appears on `enabled` alone opens a render too early, with rows holding
 *   nothing, and jumps when the values arrive.
 * @property {Error|null} error
 */

/**
 * @param {BlockResponse} block
 * @param {{ enabled?: boolean }} [options]
 * @returns {UseCmsTranslationsResult}
 */
export function useCmsTranslations(block, options) {
  const enabled = options?.enabled ?? false;
  const {
    config, blocksStore, commitBlocks, uiStore,
    translationDraftsStore, setTranslationDraft, clearTranslationDrafts,
    getAccessToken,
  } = useCmsContext();
  const { slug: routeSlug, locale } = useCmsRoute();
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  const blockPath = block.blockPath;

  const otherLocales = useMemo(() => resolveOtherLocales(config, locale), [config, locale]);

  // The route's slug, never the block's own. `fetchRouteBlocks` already folds
  // the global slug in, so a header block's other languages arrive inside the
  // page's entry; addressing the fetch by `_slug` instead would ask for
  // `__global`, which is not a route, and key the result under a pathname
  // (`/en__global`) that nothing can resolve a locale back out of.
  const pathnames = useMemo(
    () => otherLocales.map((l) => localizePath(routeSlug, l, config)),
    [otherLocales, routeSlug, config],
  );

  // Which `refetchToken` this hook has finished asking about, not whether a
  // request is open. The caller needs "can I show this yet", and a plain
  // `isLoading` answers no to that before the effect has even run: it starts
  // false, so a panel gated on it opens on the render before the fetch, with
  // rows that have nothing in them, then jumps when the values land.
  const [settled, setSettled] = useState(
    /** @returns {{ token: number|null, error: Error|null }} */
    () => ({ token: null, error: null }),
  );

  useEffect(() => {
    if (!enabled || pathnames.length === 0) return;

    let cancelled = false;
    // Shared with every other card on this page: the second block to be
    // rewritten reads what the first one already pulled. `refetchToken` is what
    // expires it, because a publish is the one thing that moves the other
    // languages' versions, and sending a stale version is the 409 this avoids.
    const cache = cacheFor(blocksStore);

    const stale = pathnames
      .map((pathname, i) => ({ pathname, targetLocale: otherLocales[i] }))
      .filter(({ pathname }) => cache.fetchedAt.get(pathname) !== refetchToken);
    if (stale.length === 0) {
      // Another card already pulled these. Ready without a request, which is
      // the whole point of sharing the cache.
      if (settled.token !== refetchToken) setSettled({ token: refetchToken, error: null });
      return;
    }

    (async () => {
      try {
        const accessToken = await getAccessToken();
        await Promise.all(stale.map(async ({ pathname, targetLocale }) => {
          // No abort signal, unlike `useCmsContent`'s fetch. This one is shared:
          // the first card to ask owns the request, so its signal would cancel
          // the response every other card is waiting on. There is nothing to
          // abort for anyway — the result lands in a store the whole provider
          // reads, so a card that unmounted mid-flight has left the next one a
          // warm entry rather than wasted a request.
          const merged = await dedupe(cache, pathname, () => fetchRouteBlocks({
            config,
            slug: routeSlug,
            locale: targetLocale,
            accessToken,
          }));
          // Recorded even when this card has moved on, since the entry it
          // commits is good for whoever asks next.
          cache.fetchedAt.set(pathname, refetchToken);
          commitBlocks(pathname, indexBlocksByPath(merged));
        }));
        if (cancelled) return;
        setSettled({ token: refetchToken, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[inscribed] translation fetch failed:", err);
        // Settled either way: a language that cannot be read is an answer, and
        // the panel says so rather than waiting forever.
        setSettled({ token: refetchToken, error: /** @type {Error} */ (err) });
      }
    })();

    return () => { cancelled = true; };
  }, [
    enabled, pathnames, otherLocales, refetchToken, settled.token,
    config, routeSlug, blocksStore, commitBlocks, getAccessToken,
  ]);

  // Only the target routes' maps, not the whole store: the current route's
  // entry is rewritten on every autosave roundtrip, and subscribing to it would
  // re-render this card for a write that cannot change anything it shows.
  const targetBlocks = useStoreSelector(
    blocksStore,
    (s) => pathnames.map((p) => s.get(p) ?? EMPTY_BLOCKS),
    sameEntries,
  );
  const drafts = useStoreSelector(translationDraftsStore, (m) => m);

  const targets = useMemo(
    () => otherLocales.map((targetLocale, i) => {
      const pathname = pathnames[i];
      const key = translationDraftKey(pathname, blockPath);
      const target = targetBlocks[i].get(blockPath) ?? null;
      const hasDraft = drafts.has(key);
      return {
        locale: targetLocale,
        pathname,
        key,
        block: target,
        value: hasDraft ? drafts.get(key) : target?.value,
        hasDraft,
        setValue: (/** @type {*} */ value) => setTranslationDraft(key, value),
        reset: () => clearTranslationDrafts([key]),
      };
    }),
    [otherLocales, pathnames, blockPath, targetBlocks, drafts, setTranslationDraft, clearTranslationDrafts],
  );

  return {
    targets,
    // Nothing was asked for, so there is nothing to wait on.
    isReady: !enabled || settled.token === refetchToken,
    error: settled.error,
  };
}

/**
 * Element-wise identity, so the selector above may allocate its array freely:
 * `useStoreSelector` keeps the previous reference whenever this returns true.
 *
 * @param {readonly unknown[]} a
 * @param {readonly unknown[]} b
 * @returns {boolean}
 */
function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
