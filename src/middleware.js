/**
 * @file `inscribed/middleware`: the Next.js proxy (`proxy.js`, formerly
 * middleware) the SDK needs, so an app doesn't have to hand-write it.
 *
 * This entry is deliberately thin on imports. The proxy runs ahead of
 * rendering, where `next/headers` and Server Actions can't, which is why the
 * app's `createCmsPage` module is unreachable from here and the locale list has
 * to come in as an argument.
 */

import { NextResponse } from "next/server";

import { resolveCmsRoute } from "./shared/route.js";

const PATHNAME_HEADER = "x-pathname";

/**
 * Build the middleware `<CmsPage>` depends on.
 *
 * It does two things, and the order between them is the whole point:
 *
 * 1. Copies the pathname **as the visitor sees it** into `x-pathname`, which is
 *    what `<CmsPage>` splits into a slug and a locale. It has to be the
 *    pre-rewrite path, because that is also what `usePathname()` reports in the
 *    browser; taking the rewritten one would make the server and the client
 *    disagree about which language the page is in.
 *
 * 2. Rewrites an unprefixed path onto the default locale, so `/about` is served
 *    by `/[locale]/about` without `tr` ever reaching the address bar. Paths under
 *    another language's prefix pass straight through, and the default
 *    language's own prefix (`/tr/about`) redirects to the unprefixed path.
 *
 * Pass no `locales` and step 2 is skipped entirely: a single-language site gets
 * exactly the header-only middleware it had before.
 *
 * @param {{ locales?: string[], defaultLocale?: string|null }} [config]
 *   Typically your `cms.config.js`, or the same object you give `createCmsConfig`.
 * @returns {(req: import("next/server").NextRequest) => NextResponse}
 *
 * @example
 * // proxy.js
 * import { createCmsMiddleware } from "inscribed/middleware";
 * import * as cms from "./cms.config.js";
 *
 * export const proxy = createCmsMiddleware(cms);
 * export const config = {
 *   matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
 * };
 */
export function createCmsMiddleware(config = {}) {
  const locales = config.locales ?? [];
  const defaultLocale = config.defaultLocale ?? locales[0] ?? null;

  return function cmsMiddleware(req) {
    const { pathname } = req.nextUrl;

    const headers = new Headers(req.headers);
    headers.set(PATHNAME_HEADER, pathname);

    if (!defaultLocale) return NextResponse.next({ request: { headers } });

    // `resolveCmsRoute` is the same reader `<CmsPage>` uses, so "is this path
    // already prefixed" can't drift between the rewrite and the render.
    const { locale } = resolveCmsRoute(pathname, { locales, defaultLocale });
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      // The default language lives at the root, so its prefixed form would be a
      // second address for every page.
      if (locale === defaultLocale) {
        const url = req.nextUrl.clone();
        url.pathname = pathname.slice(locale.length + 1) || "/";
        return NextResponse.redirect(url, 308);
      }
      return NextResponse.next({ request: { headers } });
    }

    const url = req.nextUrl.clone();
    url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  };
}
