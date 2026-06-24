/**
 * @file Server-side content fetchers and sync helpers, published under
 * `inscribed/server`. Use from Server Components, layouts, route handlers, or
 * build scripts; never from a client component.
 *
 * Read helpers attach a service token from `config.getServiceToken`, or fall
 * back to `noServiceToken` and read unauthenticated. Inject a real provider
 * via `createCmsPage({ getServiceToken })` if your backend requires auth.
 */

import { createRestTransport } from "../defaults/transport.js";
import { noServiceToken } from "../defaults/service-token.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { ServiceTokenProvider } from "../lib/service-token.js"
 * @import { BlockResponse, ContentResponse, SyncManifestRequest, SyncResultResponse } from "../lib/schemas.js"
 */

/**
 * @param {string} slug
 * @returns {string}
 */
export function cmsCacheTag(slug) {
  return `cms-${slug}`;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GetCmsContentOptions
 * @property {number | false} [revalidate]   ISR window in seconds, or `false` for tag-only invalidation.
 * @property {string[]} [tags]               Extra cache tags.
 * @property {string} [accessToken]          Explicit token; wins over `config.getServiceToken`.
 */

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a page's blocks from a Server Component.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {GetCmsContentOptions} [options]
 * @returns {Promise<ContentResponse>}
 */
export async function getCmsContent(config, slug, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken = options?.accessToken ?? (await getServiceToken());
  const transport = config.transport ?? createRestTransport(config);
  return transport.getContent(slug, {
    accessToken,
    cache: {
      revalidate: options?.revalidate ?? false,
      tags: [cmsCacheTag(slug), ...(options?.tags ?? [])],
    },
  });
}

/**
 * Fetch a page's blocks and the global slug (`config.globalSlug`) in parallel,
 * then stamp each block with its source slug so the save layer can PUT it back
 * to the right place. Blocks are ISR-cached under `cmsCacheTag(slug)`.
 *
 * Collection-typed blocks are declarations only here; `<CollectionRegion>` /
 * `<CollectionItem>` fetch their items at render time under their own tag.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {{ contentOptions?: GetCmsContentOptions }} [options]
 * @returns {Promise<BlockResponse[]>}
 */
export async function getCmsPageBlocks(config, slug, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken =
    options?.contentOptions?.accessToken ?? (await getServiceToken());

  const globalSlug =
    config.globalSlug && config.globalSlug !== slug ? config.globalSlug : null;

  const [content, globalContent] = await Promise.all([
    getCmsContent(config, slug, { ...options?.contentOptions, accessToken }),
    globalSlug
      ? getCmsContent(config, globalSlug, { ...options?.contentOptions, accessToken })
          .catch(() => ({ slug: globalSlug, blocks: [] }))
      : Promise.resolve({ slug: "", blocks: [] }),
  ]);

  const pageBlocks = content.blocks.map((b) => ({ ...b, _slug: slug }));

  if (!globalSlug || globalContent.blocks.length === 0) return pageBlocks;

  // Page wins on a path collision (defensive; shouldn't happen). Global blocks
  // append at the bottom; the AdminDrawer orders each slug group by sortOrder.
  /** @type {Set<string>} */
  const pagePaths = new Set(pageBlocks.map((b) => b.blockPath));
  const stampedGlobal = globalContent.blocks
    .filter((b) => !pagePaths.has(b.blockPath))
    .map((b) => ({ ...b, _slug: globalSlug }));

  return [...pageBlocks, ...stampedGlobal];
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

/**
 * `POST /cms/sync`: reconcile the entire block manifest in one call. The
 * backend treats `manifests` as the complete desired state, soft-deleting
 * absent slugs/blocks and restoring reappearing ones. Idempotent; for
 * build/deploy pipelines.
 *
 * @param {CmsConfig} config
 * @param {SyncManifestRequest[]} manifests
 * @param {string} [accessToken]
 * @returns {Promise<SyncResultResponse>}
 */
export function syncCmsManifest(config, manifests, accessToken) {
  const transport = config.transport ?? createRestTransport(config);
  return transport.syncManifests(manifests, { accessToken });
}

/**
 * Self-contained wrapper around `syncManifests` for CLI/build scripts: resolves
 * a service token (default: none), POSTs the manifest, logs per-slug counts and
 * pruned slugs, and throws with a readable message on failure.
 *
 * @param {SyncManifestRequest[]} manifests
 * @param {{ baseUrl?: string, getServiceToken?: ServiceTokenProvider }} [options]
 * @returns {Promise<void>}
 */
export async function syncAll(manifests, options) {
  const config = {
    baseUrl: options?.baseUrl ?? process.env.CMS_URL ?? "http://localhost:5000",
  };
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
    result = await transport.syncManifests(manifests, { accessToken: accessToken || undefined });
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

