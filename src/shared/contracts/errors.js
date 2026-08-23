/**
 * @file The error shape every transport throws, so the UI's `instanceof` /
 * `.status` branches work the same regardless of backend. `toApiError` builds
 * one from an HTTP `Response`; non-REST transports can ignore it.
 */

/**
 * @import { BlockConflict, ProblemDetails } from "./schemas.js"
 */

/**
 * Thrown for any non-2xx response. Carries the ProblemDetails payload when
 * present, plus the parsed `conflicts` extension so a 409 can be resolved per
 * block instead of as one opaque failure.
 */
export class CmsApiError extends Error {
  /**
   * @param {Object} args
   * @param {number} args.status
   * @param {string} args.detail
   * @param {string} [args.title]
   * @param {ProblemDetails|null} [args.problem]
   * @param {BlockConflict[]|null} [args.conflicts]
   * @param {string|null} [args.reason]
   * @param {string|null} [args.conflictingSlug]
   */
  constructor({ status, detail, title, problem, conflicts, reason, conflictingSlug }) {
    super(detail || title || `CMS request failed (${status})`);
    this.name = "CmsApiError";
    this.status = status;
    this.title = title ?? null;
    this.detail = detail ?? null;
    this.problem = problem ?? null;
    /**
     * Blocks the backend refused, or `null` when the body carried no
     * `conflicts` key at all. The distinction is the whole point: a list means
     * "these blocks moved under you, here is what to reconcile", `null` means a
     * plain write race with nothing block-level to show.
     *
     * @type {BlockConflict[]|null}
     */
    this.conflicts = conflicts ?? null;
    /**
     * Machine-readable discriminator on a 409, when the backend sends one:
     * `"archived"`, `"taken"` or `"alias"`.
     *
     * @type {string|null}
     */
    this.reason = reason ?? null;
    /**
     * Which record is in the way on a `"taken"` / `"alias"` conflict, so the
     * message can name it rather than saying "some other record".
     *
     * @type {string|null}
     */
    this.conflictingSlug = conflictingSlug ?? null;
  }

  get isConflict() {
    return this.status === 409;
  }

  /**
   * The write was refused because the row is in the archive, not because
   * someone else got there first. A merge screen cannot resolve this one: the
   * only way forward is restore.
   */
  get isArchivedConflict() {
    return this.status === 409 && this.reason === "archived";
  }

  /**
   * The slug in the *path* is an old address: the record moved, and this caller
   * is still writing to where it used to be. `conflictingSlug` is where it lives
   * now.
   *
   * The backend refuses rather than following the alias on purpose. A write that
   * silently redirected would land on a record the caller never named, and the
   * caller would never learn its address was stale, so it would keep doing it.
   * Answered by every write path: publish, draft, archive, restore, rename.
   */
  get isMovedConflict() {
    return this.status === 409 && this.reason === "moved";
  }

  /**
   * A rename was refused because a live or archived record already holds the
   * requested slug. Only a different slug gets past it.
   */
  get isSlugTakenConflict() {
    return this.status === 409 && this.reason === "taken";
  }

  /**
   * A rename was refused because the slug it was *given* is another record's old
   * address. The mirror of `isMovedConflict`, which is about the slug in the
   * path, and the reason the two carry different reasons: one is answered by
   * repointing, the other by asking the user.
   *
   * `?replaceAlias=true` forces it through, so this one is a question rather
   * than a dead end: taking the address breaks whatever still links to
   * `conflictingSlug`.
   */
  get isAliasConflict() {
    return this.status === 409 && this.reason === "alias";
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

/**
 * Parse a non-2xx response into a CmsApiError. Tolerates non-JSON bodies.
 *
 * @param {Response} response
 * @returns {Promise<CmsApiError>}
 */
export async function toApiError(response) {
  /** @type {ProblemDetails|null} */
  let problem = null;
  let rawBody = "";
  try {
    rawBody = await response.text();
    if (rawBody) {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        problem = /** @type {ProblemDetails} */ (parsed);
      }
    }
  } catch {
    // Not JSON. Keep rawBody so a plain-text error still bubbles up.
  }

  // An empty array is kept as an empty array: only a missing key means "no
  // block-level expectation" (see `CmsApiError.conflicts`).
  const raw = /** @type {*} */ (problem)?.conflicts;
  const conflicts = Array.isArray(raw)
    ? raw.filter((c) => c && typeof c.path === "string")
    : null;

  // Prefer ProblemDetails.detail, fall back to the raw body, then statusText.
  const detail = problem?.detail || (rawBody && !problem ? rawBody : "") || response.statusText;

  const rawReason = /** @type {*} */ (problem)?.reason;
  const rawConflictingSlug = /** @type {*} */ (problem)?.conflictingSlug;

  return new CmsApiError({
    status: response.status,
    title: problem?.title,
    detail,
    problem,
    conflicts,
    reason: typeof rawReason === "string" ? rawReason : null,
    conflictingSlug: typeof rawConflictingSlug === "string" ? rawConflictingSlug : null,
  });
}
