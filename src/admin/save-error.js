/**
 * @file Turns a failed save into the line the drawer's banner shows. Pure, no
 * React, so the wording of each case is testable on its own.
 *
 * The two 409s are deliberately different messages. One names blocks and has a
 * resolution waiting on the cards below; the other is a bare write race with
 * nothing block-level to reconcile, so all it can honestly ask for is a retry.
 */

import { CmsApiError } from "../shared/contracts/errors.js";

/**
 * @typedef {Object} SaveErrorDescription
 * @property {"conflict"|"forbidden"|"error"} tone
 * @property {string} text
 */

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
 * @returns {SaveErrorDescription|null} `null` when there is nothing to show.
 */
export function describeSaveError(error, t, unresolvedCount = 0) {
  if (!error) return null;
  if (!(error instanceof CmsApiError)) {
    return { tone: "error", text: error.message || t("saveError.generic") };
  }

  if (error.isConflict) {
    // A 409 that named blocks is only worth a banner while some are unresolved.
    if (error.conflicts?.length) {
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
