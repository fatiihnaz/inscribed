/**
 * @file Transport-agnostic error contract.
 *
 * `CmsApiError` is the error shape the core understands - any transport
 * (the default REST one in `defaults/transport.js`, or a custom backend
 * adapter) throws it on a failed request so the UI's `instanceof` / `.status`
 * branches work uniformly. `toApiError` is an HTTP helper that builds one
 * from a `Response`; REST-style transports reuse it, others can ignore it.
 */

/**
 * @import { ProblemDetails } from "./schemas.js"
 */

/**
 * Error thrown for any non-2xx response. Carries the backend's
 * ProblemDetails payload when one is available, plus a `blockPath` hint
 * for 409 conflicts so callers can surface per-field errors.
 */
export class CmsApiError extends Error {
  /**
   * @param {Object} args
   * @param {number} args.status
   * @param {string} args.detail
   * @param {string} [args.title]
   * @param {ProblemDetails|null} [args.problem]
   * @param {string|null} [args.blockPath]
   */
  constructor({ status, detail, title, problem, blockPath }) {
    super(detail || title || `CMS request failed (${status})`);
    this.name = "CmsApiError";
    this.status = status;
    this.title = title ?? null;
    this.detail = detail ?? null;
    this.problem = problem ?? null;
    this.blockPath = blockPath ?? null;
  }

  get isConflict() {
    return this.status === 409;
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
    // Body present but not JSON. Keep `rawBody` so the caller can still
    // surface whatever the backend wrote (often a plain "validation
    // failed: ..." string).
  }

  const blockPath =
    problem && typeof (/** @type {*} */ (problem).blockPath) === "string"
      ? /** @type {*} */ (problem).blockPath
      : null;

  // Prefer ProblemDetails.detail; fall back to the raw body so non-JSON
  // 4xx responses (rare but they happen) still bubble up something useful.
  const detail = problem?.detail || (rawBody && !problem ? rawBody : "") || response.statusText;

  return new CmsApiError({
    status: response.status,
    title: problem?.title,
    detail,
    problem,
    blockPath,
  });
}
