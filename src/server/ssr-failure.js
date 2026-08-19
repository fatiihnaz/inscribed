/**
 * @file What a failed SSR content fetch does, shared by the four call sites.
 *
 * Without this, a caught failure rendered empty and `revalidate: false` stored
 * that render indefinitely: a seconds-long blip could outlive itself by weeks.
 */

import { unstable_noStore } from "next/cache";

import { CmsApiError } from "../shared/contracts/errors.js";

const PHASE_PRODUCTION_BUILD = "phase-production-build";

/**
 * A network failure never lands here: `fetch` rejects with a TypeError before
 * the transport can build a `CmsApiError`, so "no status" already means down.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissingContent(err) {
  return err instanceof CmsApiError && err.status === 404;
}

/**
 * Next signals "bail out of static generation" by throwing, so its control flow
 * arrives through the same catch blocks as ours and must be let through.
 *
 * Matched on `digest`, not by class: the error types live behind private
 * `next/dist/**` paths, the digests are what Next's own boundaries match on.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isFrameworkSignal(err) {
  const digest = /** @type {{ digest?: unknown }} */ (err)?.digest;
  if (typeof digest !== "string") return false;
  return digest === "DYNAMIC_SERVER_USAGE"
    || digest === "NEXT_REDIRECT"
    || digest === "NEXT_NOT_FOUND"
    || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}

/** @returns {boolean} `next build`, as opposed to an ISR regeneration. */
export function isBuildPhase() {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/**
 * @typedef {Object} SsrErrorContext
 * @property {"page" | "global" | "collection"} kind
 * @property {string} target   The slug or collection key the fetch was for.
 * @property {string|null} [locale]
 */

/**
 * @typedef {(err: unknown, context: SsrErrorContext) => void} SsrErrorReporter
 */

/**
 * Returns when the caller should render its empty state, throws when it should
 * not render at all: on a framework signal, during a build (an unreachable
 * backend must not ship as a green deploy), and out of `unstable_noStore`.
 *
 * That last one is why an outage costs two attempts per request. `noStore`
 * bails the static render by throwing; Next re-renders the route dynamically,
 * the retry lands here again, and on a request-time render `noStore` is a
 * no-op, so the second pass renders empty and stores nothing.
 *
 * @param {unknown} err
 * @param {SsrErrorContext} context
 * @param {SsrErrorReporter | null} [onSsrError]
 *   Not called for a framework signal or a 404. Its own throw is swallowed.
 * @returns {void}
 */
export function handleSsrFailure(err, context, onSsrError) {
  if (isFrameworkSignal(err)) throw err;
  if (isMissingContent(err)) return;

  if (onSsrError) {
    try {
      onSsrError(err, context);
    } catch {
      // Best-effort by definition.
    }
  }

  // Production is silent by design; `onSsrError` is the invited channel.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[inscribed] SSR ${context.kind} fetch failed for "${context.target}":`, err);
  }

  if (isBuildPhase()) throw err;
  unstable_noStore();
}
