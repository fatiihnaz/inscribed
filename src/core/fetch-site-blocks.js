/**
 * @file The editor's read of the whole site, in one request.
 *
 * A visitor never needs this: the site arrived with the page and every route
 * renders from the store. An editor does, because only a request carrying their
 * credential comes back with `draftValue` and the versions a save is written
 * against. Reading it once per session rather than once per route is what makes
 * an editor's navigation cost the same as a visitor's, which is nothing.
 *
 * Returns the same `{ pages, global }` shape the server hands `<CmsPage>`, so
 * both reads seed the store through one function.
 */

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { SiteContent } from "./site-blocks.js"
 */

/**
 * @param {{
 *   config: CmsConfig,
 *   locale?: string | null,
 *   accessToken?: string | null,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<SiteContent>}
 */
export async function fetchSiteBlocks({ config, locale, accessToken, signal }) {
  const { pages, global } = await config.transport.getSiteContent({
    accessToken: accessToken || undefined,
    locale: locale ?? undefined,
    signal,
  });
  return { pages, global };
}
