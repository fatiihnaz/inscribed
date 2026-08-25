/**
 * @file Manifest reconcile helpers, split out of `get-content.js` so the
 * `cms-sync` CLI can reach them without loading the render-time side.
 *
 * That split is load-bearing, not tidiness: this module has to stay importable
 * from plain Node. `get-content.js` pulls in `ssr-failure.js`, which imports
 * `next/cache` at the top level. Inside a Next build that resolves through the
 * bundler; under Node's own ESM loader it does not (Next ships no `exports`
 * field, and legacy ESM resolution does no extension guessing, so bare
 * `next/cache` names a file that isn't there). Keep this module's imports to
 * things that resolve in both worlds.
 *
 * Re-exported from `get-content.js`, so `inscribed/server` still offers both
 * from one place.
 */

import { createRestTransport } from "../defaults/transport.js";
import { ensureCmsConfig } from "../shared/config.js";
import { noServiceToken } from "../defaults/service-token.js";

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { ServiceTokenProvider } from "../shared/contracts/service-token.js"
 * @import { SyncManifestRequest, SyncResultResponse } from "../shared/contracts/schemas.js"
 */

/**
 * `POST /cms/sync`: reconcile the entire block manifest in one call. The
 * backend treats `manifests` as the complete desired state, soft-deleting
 * absent slugs/blocks and restoring reappearing ones. Idempotent; for
 * build/deploy pipelines.
 *
 * Also carries `config.locales`, which is what makes the app's config the one
 * home for the language list: sync is the step that makes the backend match the
 * code, and the set of languages is part of what the code declares.
 *
 * @param {CmsConfig} config
 * @param {SyncManifestRequest[]} manifests
 * @param {string} [accessToken]
 * @returns {Promise<SyncResultResponse>}
 */
export function syncCmsManifest(config, manifests, accessToken) {
  const transport = config.transport ?? createRestTransport(config);
  return transport.syncManifests(manifests, { accessToken, locales: config.locales });
}

/**
 * Self-contained wrapper around `syncManifests` for CLI/build scripts: resolves
 * a service token (default: none), POSTs the manifest, logs per-slug counts and
 * pruned slugs, and throws with a readable message on failure.
 *
 * @param {SyncManifestRequest[]} manifests
 * @param {{ baseUrl?: string, getServiceToken?: ServiceTokenProvider, locales?: string[] }} [options]
 *   `locales` comes from the project's `cms.config.js`, the same list the
 *   middleware routes on, and reaches the backend from here so nobody has to
 *   keep a second copy of it in step by hand.
 * @returns {Promise<void>}
 */
export async function syncAll(manifests, options) {
  const config = ensureCmsConfig({
    baseUrl: options?.baseUrl ?? process.env.CMS_URL ?? "http://localhost:5000",
    locales: options?.locales,
  });
  const transport = createRestTransport(config);
  const getServiceToken = options?.getServiceToken ?? noServiceToken;

  let accessToken = "";
  try {
    accessToken = await getServiceToken();
  } catch (err) {
    throw new Error(
      `[inscribed-sync] Failed to obtain service token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let result;
  try {
    result = await transport.syncManifests(manifests, {
      accessToken: accessToken || undefined,
      locales: config.locales,
    });
  } catch (err) {
    const detail =
      err && typeof err === "object" && "detail" in err
        ? /** @type {*} */ (err).detail
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(
      `[inscribed-sync] reconcile failed: ${detail} - backend at ${config.baseUrl} reachable?`,
    );
  }

  for (const r of result.results ?? []) {
    console.log(
      `[inscribed-sync] ${r.slug} | created=${r.created} deleted=${r.deleted} unchanged=${r.unchanged}`,
    );
  }
  if (result.prunedSlugs?.length) {
    console.log(
      `[inscribed-sync] pruned ${result.prunedSlugs.length} slug(s): ${result.prunedSlugs.join(", ")}`,
    );
  }
}
