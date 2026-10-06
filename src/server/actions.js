"use server";

/**
 * @file CMS Server Actions, imported from `inscribed/actions`. The top-level
 * `"use server"` makes every export a Server Action callable from the client.
 */

// Stale, not expired: on Next 16 an expired prerendered page 404s under
// `dynamicParams = false` and 500s while the backend is down, where a stale one
// is served once more and kept if its re-render fails.
import { revalidateTag } from "next/cache";

import { cmsCacheTag, cmsCollectionItemTag, cmsCollectionTag, cmsSiteTag } from "./get-content.js";

/**
 * Drop the cached content after an admin save. Pass this directly as
 * `onAfterSave` to `createCmsPage` or `CmsProvider`.
 *
 * Two tags: the page's own, for anything reading it through `getCmsContent`,
 * and the site's, which is what every route renders from. Only the locale that
 * was published: the other languages are cached under their own tags and
 * nothing about them changed.
 *
 * @param {string} slug
 * @param {string} [locale]  Omitted on a single-language site.
 */
export async function revalidateCmsSlug(slug, locale) {
  revalidateTag(cmsCacheTag(slug, locale), "max");
  revalidateTag(cmsSiteTag(locale), "max");
}

/**
 * Drop the ISR cache for a collection after publishing one of its records. Pass
 * as `onAfterCollectionSave` to `createCmsPage` or `CmsProvider`.
 *
 * Always drops the whole collection, not just the record: a write can move rows
 * between filter windows, reorder a list or change its total, so every window
 * that mentions the collection is suspect. With `slug`, the record's own tag
 * goes too, which is what a detail page is cached under.
 *
 * @param {string} key
 * @param {string} [slug]
 */
export async function revalidateCmsCollection(key, slug) {
  revalidateTag(cmsCollectionTag(key), "max");
  if (slug) revalidateTag(cmsCollectionItemTag(key, slug), "max");
}