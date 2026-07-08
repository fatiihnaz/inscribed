/**
 * @file The service-token seam, contract only. A service token is the
 * credential the server attaches when reading content on its own behalf, so
 * public visitors get server-rendered content without a session. It's separate
 * from the user's auth token (which flows client-side via `getAccessToken`).
 *
 * Server-only: it never crosses to the client, so it's resolved purely
 * server-side with no augment-in-provider step. The default `noServiceToken`
 * sends nothing, which the reference backend accepts only for anonymous-read
 * collections (never `/cms/content`); inject a real provider via
 * `createCmsPage({ getServiceToken })` for page content.
 */

/**
 * @callback ServiceTokenProvider
 * @returns {Promise<string>} A bearer token, or "" for an unauthenticated read.
 */

export {};
