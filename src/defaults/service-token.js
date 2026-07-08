/**
 * @file Default service-token provider: no token, so server-side reads go out
 * unauthenticated. Against the reference backend that only reaches collections
 * with anonymous read enabled; `/cms/content` always requires `cms:access`, so
 * SSR page blocks render empty until a real provider (e.g. a service key) is
 * injected via `createCmsPage({ getServiceToken })`.
 */

/**
 * @type {import("../lib/service-token.js").ServiceTokenProvider}
 */
export async function noServiceToken() {
  return "";
}
