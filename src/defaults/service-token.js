/**
 * @file Default service-token provider: no token, so server-side reads go out
 * unauthenticated. Against the reference backend that reaches the public
 * content endpoint (needs `clientKey` plus the client's anonymous-read flag)
 * and anonymous-read collections; everything else needs a credential, so SSR
 * page blocks render empty until a real provider (e.g. a `render`-preset
 * service key) is injected via `createCmsPage({ getServiceToken })`.
 */

/**
 * @type {import("../lib/service-token.js").ServiceTokenProvider}
 */
export async function noServiceToken() {
  return "";
}
