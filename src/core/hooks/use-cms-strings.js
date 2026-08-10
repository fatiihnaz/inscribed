"use client";

/**
 * @file `useCmsStrings()`: the panel's own wording, as a `t`.
 *
 * Resolved here rather than on the config because a translator is a function
 * and the config is JSON that crosses the RSC boundary. Pure helpers that emit
 * copy (`describeSaveError`, list-row labels) take `t` as an argument instead
 * of reaching for a hook, which also keeps them testable without React.
 *
 * Memoised on the two config fields it reads, so `t` keeps its identity between
 * renders and the drawer's memoised cards are not woken by it.
 */

import { useMemo } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

/**
 * @import { Translate } from "../../shared/i18n/translate.js"
 */

/**
 * @returns {Translate}
 */
export function useCmsStrings() {
  const { config } = useCmsContext();
  const { adminLocale, adminStrings } = config;
  return useMemo(
    () => createTranslator(resolveStrings(adminLocale, adminStrings), adminLocale),
    [adminLocale, adminStrings],
  );
}
