/**
 * @file The auth seam, contract only. `createCmsPage` consumes a
 * `CmsAuthAdapter` (three server-side callbacks) and never imports an auth
 * library. The default `publicAuth` treats everyone as anonymous, so the CMS
 * is read-only out of the box.
 *
 * To enable editing, supply your own adapter. The auth library and identity
 * provider are the consumer's choice; the core depends on none of them. Your
 * app builds the adapter, or an auth plugin provides one (e.g. a NextAuth +
 * Keycloak plugin's `withCmsAuth(authOptions)`).
 */

/**
 * @callback GetSession
 * @returns {Promise<*|null>} The server session, or null for an anonymous request.
 */

/**
 * @typedef {Object} CmsAuthAdapter
 * @property {GetSession} getSession
 *   Resolve the server session for the current request (null = public/anonymous).
 * @property {(session: *) => boolean} deriveAdmin
 *   Decide whether the session may edit (drives admin gating).
 * @property {(session: *) => string | null} deriveUserSub
 *   Extract a stable user id from the session (used for attribution).
 */

export {};
