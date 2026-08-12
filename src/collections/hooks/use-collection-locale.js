"use client";

/**
 * @file `useCollectionLocale(key)`: which language to address one collection in.
 *
 * The site's locale list and a collection's are different lists. A collection
 * is shared, so it can hold fewer languages than the sites reading it, or none
 * at all, and a write naming a language it never declared is rejected outright
 * ("Unknown locale 'tr'; no locales are declared here"). Reads are the lenient
 * half: they fall back to the collection's default. So the route's locale can't
 * ride along on every collection request.
 */

import { useCmsRoute } from "../../core/hooks/use-cms-route.js";
import { useCollectionMeta } from "./use-my-collections.js";

/**
 * @param {string} key
 * @returns {string|null}
 *   The route's locale when this collection holds it; null when it holds no
 *   languages at all, or holds languages but not this one, which is how the
 *   caller asks for the collection's own default.
 *
 *   Null also keeps a non-localized collection on one cache entry and one
 *   new-item draft slot, rather than one per language the site happens to serve.
 *
 *   Public visitors never fetch `/me`, so there is no per-collection list to
 *   consult and the route's locale stands. They only ever read, and a read
 *   carrying a language the collection lacks still answers with its default.
 */
export function useCollectionLocale(key) {
  const { locale } = useCmsRoute();
  const meta = useCollectionMeta(key);
  if (!meta) return locale;
  if (!meta.locales?.length) return null;
  return locale && meta.locales.includes(locale) ? locale : null;
}
