/**
 * @file The editor session held for a browser auth instance. It outlives any
 * provider mount, so a provider remounted under a new `[locale]` starts signed in.
 */

import { createStore } from "../shared/state/store.js";

/**
 * @import { BrowserAuth } from "../defaults/browser-auth.js"
 * @import { Store } from "../shared/state/store.js"
 */

/**
 * @typedef {Object} BrowserUser
 * @property {string|null} userSub
 * @property {{ name: string|null, email: string|null, image: null }} userInfo
 */

/**
 * @typedef {{ status: "none" | "expired", user: null }
 *   | { status: "connected", user: BrowserUser }} BrowserSession
 */

/** @type {BrowserSession} */
export const NO_SESSION = Object.freeze({ status: "none", user: null });
/** @type {BrowserSession} */
const EXPIRED = Object.freeze({ status: "expired", user: null });

const withoutAuth = createStore(NO_SESSION);

/** @type {WeakMap<BrowserAuth, Store<BrowserSession>>} */
const stores = new WeakMap();

/**
 * @param {BrowserAuth | null} auth
 * @param {string} clientKey
 * @returns {Store<BrowserSession>}
 */
export function browserSessionStore(auth, clientKey) {
  if (!auth) return withoutAuth;
  const existing = stores.get(auth);
  if (existing) return existing;

  const store = createStore(NO_SESSION);
  stores.set(auth, store);

  auth.onChange((authenticated, reason) => {
    if (authenticated) void adopt(auth, clientKey, store);
    else store.set(reason === "expired" && store.get().user ? EXPIRED : NO_SESSION);
  });

  return store;
}

/**
 * @param {BrowserAuth} auth
 * @param {string} clientKey
 * @param {Store<BrowserSession>} store
 */
async function adopt(auth, clientKey, store) {
  // Another tab's sign-in reaches this tab before it holds a token of its own.
  let claims = auth.claims();
  if (!claims && (await auth.refresh())) claims = auth.claims();
  if (!claims) return;

  const current = store.get();
  if (current.status === "connected" && current.user.userSub === (claims.sub ?? null)) return;

  // Capabilities still travel in the legacy `roles` claim, and `azp` has to be
  // this site: on a shared API origin the cookie may belong to another client.
  const capabilities = Array.isArray(claims.roles) ? claims.roles : [];
  if (claims.azp !== clientKey || !capabilities.includes("content:write")) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[inscribed] no content:write for "${clientKey}" (azp "${claims.azp}", roles ${JSON.stringify(capabilities)}) - add an editor membership.`,
      );
    }
    return;
  }

  store.set({
    status: "connected",
    user: {
      userSub: claims.sub ?? null,
      userInfo: { name: claims.name ?? null, email: claims.email ?? null, image: null },
    },
  });
}
