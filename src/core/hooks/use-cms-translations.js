"use client";

/**
 * @file `useCmsTranslations(block, { enabled })`: the other languages' copies of
 * one block, ready to edit.
 *
 * The fetched blocks land in `blocksStore` under the **other language's own
 * keys** (`routeKey("/haber-lab", "en")` for the page, `globalsKey("en")` for
 * that language's globals), not a private cache, so a card that opens second
 * reads what the first one already pulled, and `useCmsSave` finds the version
 * it publishes against where every other route's lives. A header block's
 * translation is therefore read the way every block is: the route's entry
 * first, then the language's globals.
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
import { globalsKey, localizePath, otherLocales as resolveOtherLocales, routeKey } from "../../shared/route.js";
import { translationDraftKey } from "../../shared/state/draft-keys.js";
import { readBlock } from "../blocks.js";
import { readLanguage, readsWholeSite } from "../read-blocks.js";
import { useCmsRoute } from "./use-cms-route.js";

/**
 * @import { BlockResponse } from "../../shared/contracts/schemas.js"
 * @import { SiteContent } from "../site-blocks.js"
 */

/**
 * Which languages have already been pulled, and which pulls are on the wire.
 *
 * This is per provider, not per card. Every card that trips the prompt wants
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
 * @typedef {Object} TranslationTarget
 * @property {string} locale
 * @property {string} pathname   The route this language's copy lives at.
 * @property {string} key        `translationDraftKey(routeKey(slug, locale), blockPath)`.
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
    config, blocksStore, commitSite, uiStore,
    translationDraftsStore, setTranslationDraft, clearTranslationDrafts,
    getAccessToken,
  } = useCmsContext();
  const { slug: routeSlug, locale } = useCmsRoute();
  const refetchToken = useStoreSelector(uiStore, (s) => s.refetchToken);

  const blockPath = block.blockPath;

  const otherLocales = useMemo(() => resolveOtherLocales(config, locale), [config, locale]);

  // The route's slug, never the block's own. A read covers a route (or the
  // whole language) and brings the globals with it into their own entry, which
  // `readBlock` below falls through to; addressing the fetch by `_slug` instead
  // would ask for `__global`, which is not a route, and key the result under an
  // entry nothing renders from.
  const keys = useMemo(
    () => otherLocales.map((l) => routeKey(routeSlug, l)),
    [otherLocales, routeSlug],
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

  const wholeSite = readsWholeSite(config);

  useEffect(() => {
    if (!enabled || keys.length === 0) return;

    let cancelled = false;
    // Shared with every other card on this page: the second block to be
    // rewritten reads what the first one already pulled. `refetchToken` is what
    // expires it, because a publish is the one thing that moves the other
    // languages' versions, and sending a stale version is the 409 this avoids.
    const cache = cacheFor(blocksStore);

    const stale = otherLocales
      .map((targetLocale, i) => ({
        targetLocale,
        // What the read covers, and so what it is worth remembering it by.
        cacheKey: wholeSite ? `site:${targetLocale}` : `route:${keys[i]}`,
      }))
      .filter(({ cacheKey }) => cache.fetchedAt.get(cacheKey) !== refetchToken);
    if (stale.length === 0) {
      // Another card already pulled these. Ready without a request, which is
      // the whole point of sharing the cache.
      if (settled.token !== refetchToken) setSettled({ token: refetchToken, error: null });
      return;
    }

    (async () => {
      try {
        const accessToken = await getAccessToken();
        await Promise.all(stale.map(async ({ cacheKey, targetLocale }) => {
          // No abort signal, unlike the provider's own read. This one is shared:
          // the first card to ask owns the request, so its signal would cancel
          // the response every other card is waiting on. There is nothing to
          // abort for anyway — the result lands in a store the whole provider
          // reads, so a card that unmounted mid-flight has left the next one a
          // warm entry rather than wasted a request.
          const site = await dedupe(cache, cacheKey, () => readLanguage({
            config,
            slug: routeSlug,
            locale: targetLocale,
            accessToken,
          }));
          // Recorded even when this card has moved on, since the entry it
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
        console.warn("[inscribed] translation fetch failed:", err);
        // Settled either way: a language that cannot be read is an answer, and
        // the panel says so rather than waiting forever.
        setSettled({ token: refetchToken, error: /** @type {Error} */ (err) });
      }
    })();

    return () => { cancelled = true; };
  }, [
    enabled, keys, otherLocales, refetchToken, settled.token, wholeSite,
    config, routeSlug, blocksStore, commitSite, getAccessToken,
  ]);

  // Only this block in the target languages, not their whole maps: the entries
  // are rewritten on every autosave roundtrip, and subscribing to them would
  // re-render this card for a write that cannot change anything it shows.
  const targetBlocks = useStoreSelector(
    blocksStore,
    (s) => otherLocales.map(
      (targetLocale, i) => readBlock(s, keys[i], globalsKey(targetLocale), blockPath) ?? null,
    ),
    sameEntries,
  );
  const drafts = useStoreSelector(translationDraftsStore, (m) => m);

  const targets = useMemo(
    () => otherLocales.map((targetLocale, i) => {
      const key = translationDraftKey(keys[i], blockPath);
      const target = targetBlocks[i];
      const hasDraft = drafts.has(key);
      return {
        locale: targetLocale,
        pathname: localizePath(routeSlug, targetLocale, config),
        key,
        block: target,
        value: hasDraft ? drafts.get(key) : target?.value,
        hasDraft,
        setValue: (/** @type {*} */ value) => setTranslationDraft(key, value),
        reset: () => clearTranslationDrafts([key]),
      };
    }),
    [otherLocales, keys, routeSlug, config, blockPath, targetBlocks, drafts, setTranslationDraft, clearTranslationDrafts],
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
