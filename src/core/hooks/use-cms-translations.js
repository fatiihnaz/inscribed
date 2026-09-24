"use client";

/**
 * @file `useCmsTranslations(block, { enabled })`: the other languages' copies of
 * one block, ready to edit.
 *
 * The fetched blocks land in `blocksStore` under the **other language's own
 * keys** (see `useLanguageReads`), not a private cache, so a card that opens
 * second reads what the first one already pulled, and `useCmsSave` finds the
 * version it publishes against where every other route's lives. A header
 * block's translation is therefore read the way every block is: the route's
 * entry first, then the language's globals.
 *
 * Drafts typed here are **not** autosaved. They live in
 * `translationDraftsStore` from the moment the drawer offers them until the
 * next publish carries them, and a navigation drops them. A half-typed
 * translation has no business becoming a server draft another editor sees in a
 * language nobody is reviewing.
 */

import { useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { globalsKey, localizePath, otherLocales as resolveOtherLocales, routeKey } from "../../shared/route.js";
import { translationDraftKey } from "../../shared/state/draft-keys.js";
import { readBlock } from "../blocks.js";
import { useCmsRoute } from "./use-cms-route.js";
import { useLanguageReads } from "./use-language-reads.js";

/**
 * @import { BlockResponse } from "../../shared/contracts/schemas.js"
 */

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
    config, blocksStore,
    translationDraftsStore, setTranslationDraft, clearTranslationDrafts,
  } = useCmsContext();
  const { slug: routeSlug, locale } = useCmsRoute();

  const blockPath = block.blockPath;

  const otherLocales = useMemo(() => resolveOtherLocales(config, locale), [config, locale]);

  // Built from the route's slug, never the block's own: a global block was read
  // into its language's globals entry, which `readBlock` below falls through
  // to, and a staged edit is keyed by the route it was offered on.
  const keys = useMemo(
    () => otherLocales.map((l) => routeKey(routeSlug, l)),
    [otherLocales, routeSlug],
  );

  const { isReady, error } = useLanguageReads(enabled);

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

  return { targets, isReady, error };
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
