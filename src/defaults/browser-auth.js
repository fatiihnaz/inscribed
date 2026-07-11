/**
 * @file Default browser auth client for the reference backend's `/auth/*`
 * cookie + refresh flow. Framework-free. `CmsProvider` activates it when the
 * consumer supplies no `getAccessToken` and the config names a `clientKey`;
 * a consumer-supplied auth always wins.
 *
 * Refresh discipline is the whole point of this module: the backend rotates
 * the refresh token on every use and treats reuse of an old one as an attack
 * (revokes the entire session family). Refreshes are therefore single-flight
 * within a tab (promise dedup) and serialized across tabs (Web Locks; where
 * unsupported the dedup stands alone). The access token lives only in memory,
 * never in storage or URLs.
 */

/** Access tokens count as stale this many ms before expiry. */
const STALE_SKEW_MS = 30_000;

// Bounds for expiry derived from the absolute `expiresAtUtc`, which mixes the
// server clock into `Date.now()` math: a slow client clock would otherwise
// yield a token that never goes stale locally (hard 401s, no retry path), a
// fast one a token that is stale on every call. A relative `expiresInSeconds`
// from the backend is clock-skew-free and trusted verbatim.
const ABS_TTL_MIN_MS = 60_000;
const ABS_TTL_MAX_MS = 10 * 60_000;

/** Cross-tab lock name; must be origin-unique, not per clientKey. */
const REFRESH_LOCK = "inscribed-refresh";

/**
 * @typedef {"signed-in" | "expired" | "logout" | "external"} AuthChangeReason
 * `expired` = a refresh came back 401 while we held a token (session revoked
 * or timed out); `external` = another tab signed in or out (storage event).
 */

/**
 * @typedef {Object} BrowserAuth
 * @property {() => Promise<boolean>} refresh   Exchange the cookie for a fresh access token. False = no session.
 * @property {() => Promise<string>} getAccessToken   Fresh token, or "" for anonymous. Never hits the network for visitors without a session hint.
 * @property {() => { sub?: string, azp?: string, roles?: string[], email?: string, name?: string } | null} claims
 *   Decoded token payload, for UI decisions only; authorization is always server-side.
 * @property {(returnTo?: string) => void} login   Full-page redirect into the backend's login flow.
 * @property {() => Promise<void>} logout
 * @property {() => boolean} hasSessionHint
 * @property {(cb: (authenticated: boolean, reason: AuthChangeReason) => void) => () => void} onChange
 *   Subscribe to auth transitions (only transitions: token renewals don't fire).
 *   The first subscriber arms the cross-tab storage watcher. Returns unsubscribe.
 */

/** @type {Map<string, BrowserAuth>} */
const instances = new Map();

/**
 * Instance cache so every provider mount (StrictMode double-mounts included)
 * shares one token and one in-flight refresh.
 *
 * @param {{ baseUrl: string, clientKey: string }} config
 * @returns {BrowserAuth}
 */
export function getBrowserAuth({ baseUrl, clientKey }) {
  const key = `${baseUrl}|${clientKey}`;
  let auth = instances.get(key);
  if (!auth) {
    auth = createBrowserAuth({ baseUrl, clientKey });
    instances.set(key, auth);
  }
  return auth;
}

/**
 * The login URL is built pure (and exported) so it stays testable in Node;
 * `login()` is just an assignment to `window.location`.
 *
 * @param {string} baseUrl
 * @param {string} clientKey
 * @param {string} returnTo   Absolute URL to land on after the callback.
 * @returns {string}
 */
export function buildLoginUrl(baseUrl, clientKey, returnTo) {
  const redirect = new URL(returnTo);
  redirect.searchParams.delete("cms-login");
  redirect.searchParams.set("cms-auth", "done");
  return (
    `${baseUrl}/auth/login?clientKey=${encodeURIComponent(clientKey)}` +
    `&redirectUri=${encodeURIComponent(redirect.toString())}`
  );
}

/**
 * @param {{ expiresInSeconds?: number, expiresAtUtc?: string }} body
 * @returns {number} Epoch ms on the client clock.
 */
function computeExpiry(body) {
  if (typeof body.expiresInSeconds === "number") {
    return Date.now() + body.expiresInSeconds * 1000;
  }
  const lifetime = Date.parse(body.expiresAtUtc ?? "") - Date.now();
  return Date.now() + Math.min(Math.max(lifetime || 0, ABS_TTL_MIN_MS), ABS_TTL_MAX_MS);
}

/**
 * @param {{ baseUrl: string, clientKey: string }} config
 * @returns {BrowserAuth}
 */
export function createBrowserAuth({ baseUrl, clientKey }) {
  /** @type {string|null} */
  let accessToken = null;
  let expiresAt = 0;
  /** @type {Promise<boolean>|null} */
  let inflight = null;

  // Boolean only, never a credential: marks "a session may exist here" so
  // anonymous visitors skip the refresh probe (and its network round trip)
  // entirely. localStorage access is wrapped for SSR and privacy modes.
  const hintKey = `inscribed:auth-hint:${clientKey}`;
  const hasSessionHint = () => {
    try {
      return globalThis.localStorage?.getItem(hintKey) === "1";
    } catch {
      return false;
    }
  };
  /** @param {boolean} on */
  const setSessionHint = (on) => {
    try {
      if (on) globalThis.localStorage?.setItem(hintKey, "1");
      else globalThis.localStorage?.removeItem(hintKey);
    } catch {
      /* ignore */
    }
  };

  const isStale = () => !accessToken || Date.now() > expiresAt - STALE_SKEW_MS;

  /** @type {Set<(authenticated: boolean, reason: AuthChangeReason) => void>} */
  const listeners = new Set();
  /** @type {(() => void) | null} */
  let unwatchStorage = null;

  /** @param {boolean} authenticated @param {AuthChangeReason} reason */
  const emit = (authenticated, reason) => {
    for (const cb of [...listeners]) cb(authenticated, reason);
  };

  // Cross-tab sync rides on the hint key: `storage` fires only in OTHER tabs,
  // so a logout (hint removed) or a first login (hint set) elsewhere reaches
  // this tab without polling.
  const watchStorage = () => {
    if (typeof window === "undefined") return null;
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
      if (e.key !== hintKey) return;
      if (e.newValue === null) {
        accessToken = null;
        expiresAt = 0;
        emit(false, "external");
      } else if (e.newValue === "1") {
        emit(true, "external");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  };

  const doRefresh = async () => {
    const run = async () => {
      const hadToken = accessToken != null;
      let res;
      try {
        res = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        // Network failure: keep the hint so the next attempt retries. In the
        // browser this is most often a CORS rejection, which surfaces as a
        // generic TypeError: say so, or the whole flow fails invisibly.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            `[inscribed] /auth/refresh unreachable (network/CORS) - is this origin in Cors__AllowedOrigins?`,
            err,
          );
        }
        return false;
      }
      if (!res.ok) {
        accessToken = null;
        expiresAt = 0;
        // 401 = no session (expired, revoked, or reuse-detection wiped the
        // family): clear the hint so future visits stay silent.
        if (res.status === 401) {
          setSessionHint(false);
          if (hadToken) emit(false, "expired");
        }
        return false;
      }
      const body = await res.json();
      accessToken = body.accessToken;
      expiresAt = computeExpiry(body);
      setSessionHint(true);
      if (!hadToken) emit(true, "signed-in");
      return true;
    };
    return typeof navigator !== "undefined" && "locks" in navigator
      ? navigator.locks.request(REFRESH_LOCK, run)
      : run();
  };

  const refresh = () =>
    (inflight ??= doRefresh().finally(() => {
      inflight = null;
    }));

  return {
    refresh,
    hasSessionHint,

    async getAccessToken() {
      if (!isStale()) return /** @type {string} */ (accessToken);
      if (!accessToken && !hasSessionHint()) return "";
      return (await refresh()) ? /** @type {string} */ (accessToken) : "";
    },

    claims() {
      if (!accessToken) return null;
      try {
        const b64 = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(b64));
      } catch {
        return null;
      }
    },

    login(returnTo) {
      window.location.href = buildLoginUrl(
        baseUrl,
        clientKey,
        returnTo ?? window.location.href,
      );
    },

    async logout() {
      try {
        await fetch(`${baseUrl}/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Backend unreachable: still drop local state; the cookie dies with
        // its TTL and the server-side token stays revocable from the admin.
      }
      accessToken = null;
      expiresAt = 0;
      setSessionHint(false);
      emit(false, "logout");
    },

    onChange(cb) {
      listeners.add(cb);
      if (listeners.size === 1) unwatchStorage = watchStorage();
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && unwatchStorage) {
          unwatchStorage();
          unwatchStorage = null;
        }
      };
    },
  };
}
