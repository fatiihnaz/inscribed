/**
 * @file What an SSR content fetch does when it fails, in one place, because the
 * three call sites (page blocks, the global slug, a collection window) all owe
 * the same answer.
 *
 * The problem this exists for: a caught fetch failure renders an empty page,
 * and with `revalidate: false` that empty render is stored in the Full Route
 * Cache indefinitely. It is droppable (the tag is collected before the fetch
 * runs, so `revalidateCmsSlug` still reaches it), but nothing drops it on its
 * own, so a seconds-long backend blip can outlive the outage by weeks.
 *
 * The answer has three branches:
 *
 *   404          The content is genuinely absent: a page not yet synced, or a
 *                client with anonymous read off. Empty is the right render and
 *                caching it is right too. Unchanged from before.
 *   build time   Refuse. A green deploy carrying an empty site is the worst
 *                outcome available, and it is the one case where failing loudly
 *                costs nothing: there are no visitors yet.
 *   otherwise    Render empty, but keep the render out of the cache, so the
 *                next request tries again instead of inheriting the outage.
 */

import { unstable_noStore } from "next/cache";

import { CmsApiError } from "../shared/contracts/errors.js";

const PHASE_PRODUCTION_BUILD = "phase-production-build";

/**
 * Whether the backend answered, and answered "there is nothing here".
 *
 * A network-level failure never lands here: `fetch` rejects with a plain
 * TypeError before the transport can build a `CmsApiError`, so "no status at
 * all" already means the infrastructure is down, not that content is missing.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissingContent(err) {
  return err instanceof CmsApiError && err.status === 404;
}

/**
 * Next signals "bail out of static generation" by throwing, so its own control
 * flow travels as an error through the same catch blocks that handle ours.
 * Swallowing one silently cancels the bail-out it was asking for.
 *
 * Matched on `digest` rather than by class: the error types live behind private
 * `next/dist/**` paths, while the digests are what Next's own boundaries match
 * on and are stable across its public surface.
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

/**
 * Whether this render is a `next build` prerender rather than a live request.
 *
 * `NEXT_PHASE` is the framework's own signal and is set for the build process;
 * an ISR regeneration on a running server is not the build phase, which is the
 * distinction that matters here.
 *
 * @returns {boolean}
 */
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
 * Decide what a failed SSR content fetch does. Returns normally when the caller
 * should render its empty state; throws when it should not render at all.
 *
 * Throws in three cases, each on purpose:
 *   - a framework signal, passed straight through
 *   - build phase, so an unreachable backend fails the build
 *   - after `unstable_noStore()`, which bails this render out of static
 *     generation by throwing a `DynamicServerError`. Next catches that and
 *     re-renders the route dynamically; the retry lands here again, where
 *     `noStore` is a no-op on a request-time render, and that second pass is
 *     the one that renders empty. So an outage costs two attempts per request
 *     and stores nothing.
 *
 * @param {unknown} err
 * @param {SsrErrorContext} context
 * @param {((err: unknown, context: SsrErrorContext) => void) | null | undefined} [onSsrError]
 *   Host-supplied reporter. Never called for a framework signal (not an error)
 *   nor for a 404 (not a failure). Its own throw is suppressed: a broken
 *   reporter must not take the page down with it.
 * @returns {void}
 */
export function handleSsrFailure(err, context, onSsrError) {
  if (isFrameworkSignal(err)) throw err;
  if (isMissingContent(err)) return;

  if (onSsrError) {
    try {
      onSsrError(err, context);
    } catch {
      // Reporting is best-effort by definition.
    }
  }

  // Production stays silent on purpose: an SDK has no business writing to a
  // host's logs uninvited, and `onSsrError` is the invited channel.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] SSR ${context.kind} fetch failed for "${context.target}":`,
      err,
    );
  }

  if (isBuildPhase()) throw err;

  // Throws on a static/ISR render, no-ops on a dynamic one. The caller renders
  // its empty state only in the second case.
  unstable_noStore();
}
