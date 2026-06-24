/**
 * @file The error shape every transport throws, so the UI's `instanceof` /
 * `.status` branches work the same regardless of backend. `toApiError` builds
 * one from an HTTP `Response`; non-REST transports can ignore it.
 */

/**
 * @import { ProblemDetails } from "./schemas.js"
 */

/**
 * Thrown for any non-2xx response. Carries the ProblemDetails payload when
 * present, plus a `blockPath` hint on 409s so callers can flag the field.
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
    // Not JSON. Keep rawBody so a plain-text error still bubbles up.
  }

  const blockPath =
    problem && typeof (/** @type {*} */ (problem).blockPath) === "string"
      ? /** @type {*} */ (problem).blockPath
      : null;

  // Prefer ProblemDetails.detail, fall back to the raw body, then statusText.
  const detail = problem?.detail || (rawBody && !problem ? rawBody : "") || response.statusText;

  return new CmsApiError({
    status: response.status,
    title: problem?.title,
    detail,
    problem,
    blockPath,
  });
}
