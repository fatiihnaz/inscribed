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
import { mergePageBlocks, resolveGlobalSlug } from "../core/merge-blocks.js";
import { ensureCmsConfig } from "../shared/config.js";
import { noServiceToken } from "../defaults/service-token.js";
import { handleSsrFailure } from "./ssr-failure.js";

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { ServiceTokenProvider } from "../shared/contracts/service-token.js"
 * @import { BlockResponse, CollectionItemResponse, CollectionListParams, CollectionListResponse, ContentResponse, SyncManifestRequest, SyncResultResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Cache tag for one page's blocks in one language.
 *
 * The locale is part of the tag because each language is a separate render:
 * sharing one tag would rebuild every translation whenever any of them is
 * published. A single-language site keeps the shorter, pre-i18n tag.
 *
 * @param {string} slug
 * @param {string|null} [locale]
 * @returns {string}
 */
export function cmsCacheTag(slug, locale) {
  return locale ? `cms-${locale}-${slug}` : `cms-${slug}`;
}

/**
 * Cache tag for a whole collection. Every window (filter/offset/limit) of a
 * collection shares it, because a single write can move rows between windows:
 * membership, ordering and totals all shift, so there is nothing finer to
 * invalidate safely.
 *
 * Locale is no exception, for the same reason: it is one more dimension of the
 * window, and a record moving between languages shifts membership exactly as a
 * filter change does. So publishing an English record does rebuild the Turkish
 * listing, which is the same trade every filter window already makes.
 *
 * @param {string} key
 * @returns {string}
 */
export function cmsCollectionTag(key) {
  return `cms-collection-${key}`;
}

/**
 * Cache tag for one record. Held alongside `cmsCollectionTag` so a detail page
 * can be dropped on its own, without rebuilding every list that mentions it.
 *
 * No locale: a slug is unique across the whole collection, translations
 * included, so it already names one record in one language.
 *
 * A record read through one of its old addresses is tagged under that address,
 * not the canonical one, so a publish naming the canonical slug doesn't drop it
 * by this tag. It comes down with `cmsCollectionTag` instead, which every entry
 * also carries and every publish also revalidates.
 *
 * @param {string} key
 * @param {string} slug
 * @returns {string}
 */
export function cmsCollectionItemTag(key, slug) {
  return `cms-collection-${key}-${slug}`;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GetCmsContentOptions
 * @property {number | false} [revalidate]   ISR window in seconds, or `false` for tag-only invalidation.
 * @property {string[]} [tags]               Extra cache tags.
 * @property {string} [accessToken]          Explicit token; wins over `config.getServiceToken`.
 * @property {boolean} [includeDrafts]
 *   Keep unpublished drafts in the response. Off by default, and the default is
 *   load-bearing: these responses are ISR-cached under one tag for every
 *   visitor, so a draft that survives here is served to the public. Opt in only
 *   for a preview route you cache separately (or not at all).
 * @property {string|null} [locale]
 *   Language to read. Omit on a single-language site; the backend then answers
 *   with the Client's default locale.
 */

/**
 * Drop unpublished fields unless the caller asked for them.
 *
 * Intent is never inferred from the credential. A backend that returns drafts
 * for a `content:write` service key is doing the right thing, and a consumer
 * building a preview supplies exactly such a key through
 * `config.getServiceToken` — so "has a token" cannot distinguish a preview from
 * an ordinary page whose key is simply over-scoped.
 *
 * @template {{ draftValue?: * } | { draftData?: * }} T
 * @param {T[]} rows
 * @param {"draftValue" | "draftData"} field
 * @param {boolean | undefined} includeDrafts
 * @returns {T[]}
 */
function withoutDrafts(rows, field, includeDrafts) {
  if (includeDrafts) return rows;
  let mutated = false;
  const out = rows.map((row) => {
    if (/** @type {*} */ (row)[field] == null) return row;
    mutated = true;
    return { ...row, [field]: null };
  });
  return mutated ? out : rows;
}

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
  const content = await transport.getContent(slug, {
    accessToken,
    locale: options?.locale ?? undefined,
    cache: {
      revalidate: options?.revalidate ?? false,
      tags: [cmsCacheTag(slug, options?.locale), ...(options?.tags ?? [])],
    },
  });
  const blocks = withoutDrafts(content.blocks, "draftValue", options?.includeDrafts);
  return blocks === content.blocks ? content : { ...content, blocks };
}

/**
 * Fetch a page's blocks and the global slug (`config.globalSlug`) in parallel,
 * then stamp each block with its source slug so the save layer can PUT it back
 * to the right place. Blocks are ISR-cached under `cmsCacheTag(slug)`.
 *
 * Collection-typed blocks are declarations only here; `<CollectionRegion>` /
 * `<CollectionItem>` fetch their items at render time under their own tag.
 *
 * A `contentOptions.locale` reaches both fetches, so the header and footer
 * arrive in the page's own language rather than the Client's default.
 *
 * The two fetches fail independently: the page's blocks and the global slug's
 * are separate content, and losing one is no reason to discard the other. They
 * used to share a fate, so a page-slug failure blanked the header and footer
 * too, even though that request had succeeded. See `ssr-failure.js` for what
 * "fail" does.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {{ contentOptions?: GetCmsContentOptions, onSsrError?: import("./ssr-failure.js").SsrErrorReporter | null }} [options]
 * @returns {Promise<BlockResponse[]>}
 */
export async function getCmsPageBlocks(config, slug, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken =
    options?.contentOptions?.accessToken ?? (await getServiceToken());

  const globalSlug = resolveGlobalSlug(config.globalSlug, slug);
  const locale = options?.contentOptions?.locale ?? null;
  const onSsrError = options?.onSsrError;

  const [content, globalContent] = await Promise.all([
    getCmsContent(config, slug, { ...options?.contentOptions, accessToken })
      .catch((err) => {
        handleSsrFailure(err, { kind: "page", target: slug, locale }, onSsrError);
        return { slug, blocks: [] };
      }),
    globalSlug
      // Caller tags stay off this one: the __global entry is shared by every
      // page, and a page-specific tag on it would let that page's revalidation
      // drop everyone's header/footer.
      ? getCmsContent(config, globalSlug, { ...options?.contentOptions, tags: undefined, accessToken })
          .catch((err) => {
            handleSsrFailure(err, { kind: "global", target: globalSlug, locale }, onSsrError);
            return { slug: globalSlug, blocks: [] };
          })
      : Promise.resolve({ slug: "", blocks: [] }),
  ]);

  return mergePageBlocks({
    slug,
    globalSlug,
    pageBlocks: content.blocks,
    globalBlocks: globalContent.blocks,
  });
}

/**
 * Fetch one window of a collection from a Server Component.
 *
 * Unlike `getCmsContent` this never sees a draft: the response is ISR-cached
 * under one tag for every visitor, so it carries published `data` only. An
 * editor's unpublished draft reaches the page through the client store instead
 * (see `CollectionProvider`).
 *
 * @param {CmsConfig} config
 * @param {string} key                       Backend collection key, e.g. "news".
 * @param {CollectionListParams} [params]    Filter / offset / limit.
 * @param {GetCmsContentOptions} [options]
 * @returns {Promise<CollectionListResponse>}
 *   Server-rendered windows are fetched with a service token, so they never
 *   carry `virtualItems`: those belong to a signed-in editor, not to the
 *   shared ISR cache entry.
 */
export async function getCmsCollection(config, key, params, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken = options?.accessToken ?? (await getServiceToken());
  const transport = config.transport ?? createRestTransport(config);
  const page = await transport.getCollection(key, params, {
    accessToken,
    cache: {
      revalidate: options?.revalidate ?? false,
      tags: [cmsCollectionTag(key), ...(options?.tags ?? [])],
    },
  });
  const items = withoutDrafts(page.items, "draftData", options?.includeDrafts);
  return items === page.items ? page : { ...page, items };
}

/**
 * Fetch a single collection record from a Server Component. Carries both tags,
 * so publishing the record or rebuilding the collection drops it.
 *
 * @param {CmsConfig} config
 * @param {string} key
 * @param {string} slug
 * @param {GetCmsContentOptions} [options]
 * @returns {Promise<CollectionItemResponse>}
 */
export async function getCmsCollectionItem(config, key, slug, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken = options?.accessToken ?? (await getServiceToken());
  const transport = config.transport ?? createRestTransport(config);
  const item = await transport.getCollectionItem(key, slug, {
    accessToken,
    cache: {
      revalidate: options?.revalidate ?? false,
      tags: [
        cmsCollectionItemTag(key, slug),
        cmsCollectionTag(key),
        ...(options?.tags ?? []),
      ],
    },
  });
  return withoutDrafts([item], "draftData", options?.includeDrafts)[0];
}

// The sync side lives in its own module so the `cms-sync` CLI can import it
// without loading this file's render-time imports; see `sync-manifest.js`.
export { syncCmsManifest, syncAll } from "./sync-manifest.js";
