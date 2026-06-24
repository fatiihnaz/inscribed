"use server";

/**
 * @file CMS Server Actions, imported from `inscribed/actions`. The top-level
 * `"use server"` makes every export a Server Action callable from the client.
 */

import { revalidateTag } from "next/cache";

import { cmsCacheTag } from "./get-content.js";

/**
 * Drop the ISR cache for a page slug after an admin save.
 * Pass this directly as `onAfterSave` to `NextAuthCmsProvider` or `CmsProvider`.
 *
 * @param {string} slug
 */
export async function revalidateCmsSlug(slug) {
  revalidateTag(cmsCacheTag(slug));
}