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
 * An edit here is that language's draft. It autosaves as one, exactly as an
 * edit on that language's own page would, so it outlives a navigation and is
 * waiting on that page too. Writing one also puts the language into the next
 * publish (see `CmsUiState.translations`), and undoing it takes it out again.
 */

import { useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { deepEqual } from "../../shared/util/deep-equal.js";
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
 * @property {*} value           What was typed, else that language's draft, else what it publishes.
 * @property {boolean} hasDraft  Whether that language has a change to this block waiting.
 * @property {boolean} edited    Whether it was changed here since this card first wrote to it.
 * @property {boolean} saving    Typed and not yet saved as a draft.
 * @property {(value: *) => void} setValue
 * @property {() => void} reset  Back to what it said before this card first wrote to it.
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
    uiStore, translationDraftsStore, setTranslationDraft, setTranslations,
  } = useCmsContext();
  const { slug: routeSlug, locale } = useCmsRoute();

  const blockPath = block.blockPath;

  const otherLocales = useMemo(() => resolveOtherLocales(config, locale), [config, locale]);

  // Built from the route's slug, never the block's own: a global block was read
  // into its language's globals entry, which `readBlock` below falls through
  // to, and a typed edit is keyed by the route it was offered on.
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
  const typed = useStoreSelector(translationDraftsStore, (m) => m);
  // What each language said before the page first wrote to it. Undo goes back
  // there rather than to the published text, which would also throw away a
  // draft written on that language's own page.
  const written = useStoreSelector(uiStore, (s) => s.translations);

  const targets = useMemo(
    () => otherLocales.map((targetLocale, i) => {
      const key = translationDraftKey(keys[i], blockPath);
      const target = targetBlocks[i];
      const saving = typed.has(key);
      const value = saving ? typed.get(key) : (target?.draftValue ?? target?.value);
      const entry = written.get(key);
      return {
        locale: targetLocale,
        pathname: localizePath(routeSlug, targetLocale, config),
        key,
        block: target,
        value,
        hasDraft: target != null && !deepEqual(value, target.value),
        edited: entry != null && !deepEqual(value, entry.before),
        saving,
        setValue: (/** @type {*} */ next) => {
          setTranslations((prev) => {
            const current = prev.get(key);
            if (current?.pulls) return prev;
            return new Map(prev).set(key, { before: current ? current.before : value, pulls: true });
          });
          setTranslationDraft(key, next);
        },
        reset: () => {
          const current = uiStore.get().translations.get(key);
          if (!current) return;
          setTranslationDraft(key, current.before);
          setTranslations((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        },
      };
    }),
    [otherLocales, keys, routeSlug, config, blockPath, targetBlocks, typed, written, uiStore, setTranslationDraft, setTranslations],
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
