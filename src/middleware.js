/**
 * @file `inscribed/middleware`: the Next.js middleware the SDK needs, so an app
 * doesn't have to hand-write it.
 *
 * This entry is deliberately thin on imports. Middleware runs in the edge
 * runtime, where `next/headers` and Server Actions can't, which is why the
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
 *    by `/[locale]/about` without `tr` ever reaching the address bar. Paths that
 *    already carry a known locale pass straight through.
 *
 * Pass no `locales` and step 2 is skipped entirely: a single-language site gets
 * exactly the header-only middleware it had before.
 *
 * @param {{ locales?: string[], defaultLocale?: string|null }} [config]
 *   Typically your `cms.config.js`, or the same object you give `createCmsConfig`.
 * @returns {(req: import("next/server").NextRequest) => NextResponse}
 *
 * @example
 * // middleware.js
 * import { createCmsMiddleware } from "inscribed/middleware";
 * import * as cms from "./cms.config.js";
 *
 * export const middleware = createCmsMiddleware(cms);
 * export const config = {
 *   matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
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
      return NextResponse.next({ request: { headers } });
    }

    const url = req.nextUrl.clone();
    url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  };
}
