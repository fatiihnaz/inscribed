/**
 * @file Turns a failed save into the line the drawer's banner shows. Pure, no
 * React, so the wording of each case is testable on its own.
 *
 * The two 409s are deliberately different messages. One names blocks and has a
 * resolution waiting on the cards below; the other is a bare write race with
 * nothing block-level to reconcile, so all it can honestly ask for is a retry.
 */

import { CmsApiError } from "../shared/contracts/errors.js";
import { localeCodes } from "../shared/util/locale-codes.js";

/**
 * @typedef {Object} SaveErrorDescription
 * @property {"conflict"|"forbidden"|"error"} tone
 * @property {string} text
 */

/**
 * The languages a failed save did publish and did not, when it did some of
 * each; null otherwise.
 *
 * @param {Error|null|undefined} error
 * @returns {{ published: string[], failed: string[] } | null}
 */
export function partialSave(error) {
  const { publishedLocales, failedLocales } = /** @type {{ publishedLocales?: string[], failedLocales?: string[] }} */ (error ?? {});
  if (!publishedLocales?.length || !failedLocales?.length) return null;
  return { published: publishedLocales, failed: failedLocales };
}

/**
 * @param {Error|null|undefined} error
 * @param {import("../shared/i18n/translate.js").Translate} t
 *   Passed in rather than read from a hook, so this stays pure and each case's
 *   wording is testable without React.
 * @param {number} [unresolvedCount]
 *   Blocks still flagged in the UI store. The count comes from there rather
 *   than from the error, because the error is a snapshot of the refused save
 *   while the flags shrink as the user picks a side: the banner has to follow
 *   the flags, and say nothing once the last one is gone.
 * @param {string|null} [locale]  The language on screen.
 * @returns {SaveErrorDescription|null} `null` when there is nothing to show.
 */
export function describeSaveError(error, t, unresolvedCount = 0, locale = null) {
  const reason = describeFailure(error, t, unresolvedCount, locale);
  const partial = partialSave(error);
  if (!reason || !partial) return reason;
  return {
    tone: reason.tone,
    text: t("saveError.partial", {
      published: localeCodes(partial.published),
      failed: localeCodes(partial.failed),
      reason: reason.text,
    }),
  };
}

/**
 * @param {Error|null|undefined} error
 * @param {import("../shared/i18n/translate.js").Translate} t
 * @param {number} unresolvedCount
 * @param {string|null} locale
 * @returns {SaveErrorDescription|null}
 */
function describeFailure(error, t, unresolvedCount, locale) {
  if (!error) return null;
  if (!(error instanceof CmsApiError)) {
    return { tone: "error", text: error.message || t("saveError.generic") };
  }

  if (error.isConflict) {
    // Only this page's own blocks get flagged on the cards. Another language's
    // have no card to flag, so its 409 is answered like a race: the refetch it
    // triggered brought the new versions, and a retry goes out against them.
    const failedLocales = /** @type {{ failedLocales?: (string|null)[] }} */ (error).failedLocales;
    const flagged = !failedLocales || failedLocales.includes(locale);
    // A 409 that named blocks is only worth a banner while some are unresolved.
    if (error.conflicts?.length && flagged) {
      if (unresolvedCount === 0) return null;
      return {
        tone: "conflict",
        text: t("saveError.conflict", { count: unresolvedCount }),
      };
    }
    // `conflicts` absent or empty: a write race, not a per-block version clash.
    return {
      tone: "conflict",
      text: t("saveError.race"),
    };
  }

  if (error.isForbidden) {
    return {
      tone: "forbidden",
      text: t("saveError.forbidden"),
    };
  }

  return { tone: "error", text: error.message || t("saveError.generic") };
}
