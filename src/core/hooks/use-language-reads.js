"use client";

/**
 * @file `useLanguageReads(enabled)`: the route on screen in every other
 * configured language, read into `blocksStore` under that language's own keys
 * (`routeKey("/haber-lab", "en")` for the page, `globalsKey("en")` for its
 * globals).
 *
 * The translation prompt reads them to offer a block's other copies, and the
 * drawer to find what is waiting to be published in them. Both come through
 * here so they share one request per language rather than making one each.
 */

import { useEffect, useMemo, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { otherLocales as resolveOtherLocales, routeKey } from "../../shared/route.js";
import { readLanguage, readsWholeSite } from "../read-blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { SiteContent } from "../site-blocks.js"
 */

/**
 * Which languages have already been pulled, and which pulls are on the wire.
 *
 * This is per provider, not per caller. Every card that trips the prompt wants
 * the same page in the same languages, so without a shared record three dirty
 * blocks would fetch `/en` three times: `inFlight` alone only merges requests
 * that overlap in time, and the second block is usually rewritten after the
 * first one's fetch has landed.
 *
 * Entries are keyed by what the read actually covered, which is the whole
 * language where the backend answers the whole-site read and one route where it
 * does not. On the first, opening a translation on another page costs nothing:
 * that language is already in the store.
 *
 * Keyed by `blocksStore` because that is the one object whose lifetime is
 * exactly the provider's. Keying by `config` looked equivalent and is not: a
 * frozen config outlives a remount, so a fresh provider would find `fetchedAt`
 * already claiming token 0 was pulled and skip the fetch its empty store needs.
 *
 * @type {WeakMap<object, {
 *   inFlight: Map<string, Promise<SiteContent>>,
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
 * @param {{ inFlight: Map<string, Promise<SiteContent>> }} cache
 * @param {string} key   What the read covers: a language, or one route of it.
 * @param {() => Promise<SiteContent>} run
 * @returns {Promise<SiteContent>}
 */
function dedupe(cache, key, run) {
  const existing = cache.inFlight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    if (cache.inFlight.get(key) === promise) cache.inFlight.delete(key);
  });
  cache.inFlight.set(key, promise);
  return promise;
}

/**
 * @typedef {Object} LanguageReads
 * @property {boolean} isReady
 *   Whether every other language has been answered for, one way or the other.
 *   A surface that appears on `enabled` alone opens a render too early, with
 *   rows holding nothing, and jumps when the values arrive.
 * @property {Error|null} error
 */

/**
 * @param {boolean} enabled
 * @returns {LanguageReads}
 */
export function useLanguageReads(enabled) {
  const { config, blocksStore, commitSite, uiStore, getAccessToken } = useCmsContext();
  const { slug: routeSlug, locale } = useCmsRoute();
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  const otherLocales = useMemo(() => resolveOtherLocales(config, locale), [config, locale]);

  // Which `refetchToken` this hook has finished asking about, not whether a
  // request is open. The caller needs "can I show this yet", and a plain
  // `isLoading` answers no to that before the effect has even run: it starts
  // false, so a panel gated on it opens on the render before the fetch, with
  // rows that have nothing in them, then jumps when the values land.
  const [settled, setSettled] = useState(
    /** @returns {{ token: number|null, error: Error|null }} */
    () => ({ token: null, error: null }),
  );

  const wholeSite = readsWholeSite(config);

  useEffect(() => {
    if (!enabled || otherLocales.length === 0) return;

    let cancelled = false;
    // Shared with every other caller on this page: the second block to be
    // rewritten reads what the first one already pulled. `refetchToken` is what
    // expires it, because a publish is the one thing that moves the other
    // languages' versions, and sending a stale version is the 409 this avoids.
    const cache = cacheFor(blocksStore);

    const stale = otherLocales
      .map((targetLocale) => ({
        targetLocale,
        // What the read covers, and so what it is worth remembering it by. The
        // route's slug, never a block's own: a read covers a route (or the
        // whole language) and brings the globals with it into their own entry.
        cacheKey: wholeSite
          ? `site:${targetLocale}`
          : `route:${routeKey(routeSlug, targetLocale)}`,
      }))
      .filter(({ cacheKey }) => cache.fetchedAt.get(cacheKey) !== refetchToken);
    if (stale.length === 0) {
      // Another caller already pulled these. Ready without a request, which is
      // the whole point of sharing the cache.
      if (settled.token !== refetchToken) setSettled({ token: refetchToken, error: null });
      return;
    }

    (async () => {
      try {
        const accessToken = await getAccessToken();
        await Promise.all(stale.map(async ({ cacheKey, targetLocale }) => {
          // No abort signal, unlike the provider's own read. This one is shared:
          // the first caller to ask owns the request, so its signal would cancel
          // the response every other one is waiting on. There is nothing to
          // abort for anyway: the result lands in a store the whole provider
          // reads, so a caller that unmounted mid-flight has left the next one a
          // warm entry rather than wasted a request.
          const site = await dedupe(cache, cacheKey, () => readLanguage({
            config,
            slug: routeSlug,
            locale: targetLocale,
            accessToken,
          }));
          // Recorded even when this caller has moved on, since the entry it
          // commits is good for whoever asks next.
          cache.fetchedAt.set(cacheKey, refetchToken);
          // Writes that language's page entry and its globals; every other
          // language's, this one's included, is left alone.
          commitSite(site, targetLocale);
        }));
        if (cancelled) return;
        setSettled({ token: refetchToken, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[inscribed] other-language read failed:", err);
        // Settled either way: a language that cannot be read is an answer, and
        // the caller says so rather than waiting forever.
        setSettled({ token: refetchToken, error: /** @type {Error} */ (err) });
      }
    })();

    return () => { cancelled = true; };
  }, [
    enabled, otherLocales, refetchToken, settled.token, wholeSite,
    config, routeSlug, blocksStore, commitSite, getAccessToken,
  ]);

  return {
    // Nothing was asked for, so there is nothing to wait on.
    isReady: !enabled || otherLocales.length === 0 || settled.token === refetchToken,
    error: settled.error,
  };
}
