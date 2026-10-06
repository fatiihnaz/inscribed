/**
 * @file `inscribed/revalidate`: a Route Handler that marks collection tags
 * stale, for writes that reach the backend without the drawer (a bot, an
 * import script) and so never run the publish actions.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { cmsCollectionTag } from "./get-content.js";

let warnedNoSecret = false;

/**
 * Build the POST handler for a revalidation route.
 *
 * The caller sends `Authorization: Bearer <secret>` and the collections that
 * changed, `{ "collections": ["news", "staff"] }`. Each tag is marked stale
 * with the `"max"` profile, as the publish actions do: a route's next read
 * still gets the cached copy while the fresh one renders behind it. Every
 * record read carries its collection's tag as well, so naming the collection
 * covers its records, old addresses included.
 *
 * @param {{ secret: string | undefined, tags?: (collections: string[]) => string[] }} options
 *   `secret` is typically an env var; without one every request is refused.
 *   `tags` names the app's own tags to mark stale for a set of changed
 *   collections, such as a feed built from several of them.
 * @returns {(request: Request) => Promise<Response>}
 *
 * @example
 * // app/cms-revalidate/route.js
 * import { createRevalidateHandler } from "inscribed/revalidate";
 *
 * export const POST = createRevalidateHandler({ secret: process.env.CMS_REVALIDATE_SECRET });
 */
export function createRevalidateHandler({ secret, tags } = /** @type {*} */ ({})) {
  return async function POST(request) {
    if (!secret) {
      if (!warnedNoSecret) {
        warnedNoSecret = true;
        // eslint-disable-next-line no-console
        console.error("[inscribed] the revalidation route has no secret, so it refuses every request.");
      }
      return Response.json({ error: "revalidation is not configured" }, { status: 500 });
    }
    if (!sameSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    /** @type {*} */
    let body = null;
    try {
      body = await request.json();
    } catch {
      // Answered below like any other body that names no collections.
    }
    const collections = body?.collections;
    if (!Array.isArray(collections) || collections.some((key) => typeof key !== "string" || key === "")) {
      return Response.json({ error: "expected { \"collections\": string[] }" }, { status: 400 });
    }

    const revalidated = [...new Set([...collections.map((key) => cmsCollectionTag(key)), ...(tags?.(collections) ?? [])])];
    for (const tag of revalidated) revalidateTag(tag, "max");
    return Response.json({ revalidated });
  };
}

/**
 * Constant-time comparison of the header against the expected value. Hashing
 * first gives both sides one length, which `timingSafeEqual` requires.
 *
 * @param {string | null} given
 * @param {string} expected
 */
function sameSecret(given, expected) {
  if (given == null) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
