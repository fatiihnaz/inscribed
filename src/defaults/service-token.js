/**
 * @file Default service-token provider: no token, so server-side reads go out
 * unauthenticated (correct for public backends). Inject a real provider via
 * `createCmsPage({ getServiceToken })` when reads need auth.
 */

/**
 * @type {import("../lib/service-token.js").ServiceTokenProvider}
 */
export async function noServiceToken() {
  return "";
}
