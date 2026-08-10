/**
 * @file The panel's fallback language, on its own so `config.js` can name it
 * without pulling the catalogs in behind it. `createCmsConfig` runs in Server
 * Components, and the catalogs are client-side wording no server render reads.
 */

export const DEFAULT_ADMIN_LOCALE = "en";
