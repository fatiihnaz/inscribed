import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createBrowserAuth,
  getBrowserAuth,
  buildLoginUrl,
} from "../defaults/browser-auth.js";

/**
 * The contract under test is refresh discipline: the backend revokes the whole
 * session family on refresh-token reuse, so concurrent callers must collapse
 * into one request, and anonymous visitors must produce zero auth traffic.
 */

const BASE = "https://api.test";
const KEY = "my-site";
const HINT = `inscribed:auth-hint:${KEY}`;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const fakeJwt = (payload) => `${b64url({ alg: "none" })}.${b64url(payload)}.x`;

function refreshBody({ expiresInMs = 15 * 60_000, expiresInSeconds, payload = { sub: "u1" } } = {}) {
  return {
    accessToken: fakeJwt(payload),
    ...(expiresInSeconds != null
      ? { expiresInSeconds }
      : { expiresAtUtc: new Date(Date.now() + expiresInMs).toISOString() }),
  };
}

/** Resolve the next fetch() with a JSON body and status. */
function fetchResolves(body, status = 200) {
  global.fetch.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

let store;

beforeEach(() => {
  global.fetch = vi.fn();
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
});

const makeAuth = () => createBrowserAuth({ baseUrl: BASE, clientKey: KEY });

describe("getAccessToken", () => {
  it("returns '' with zero network traffic for visitors without a session hint", async () => {
    const auth = makeAuth();
    expect(await auth.getAccessToken()).toBe("");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refreshes when a session hint exists, then serves the token from memory", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    const body = refreshBody();
    fetchResolves(body);

    expect(await auth.getAccessToken()).toBe(body.accessToken);
    expect(await auth.getAccessToken()).toBe(body.accessToken);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("re-refreshes a token inside the 30s staleness skew", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    // Relative expiry is clock-skew-free and trusted verbatim, no clamping.
    fetchResolves(refreshBody({ expiresInSeconds: 10 }));
    await auth.getAccessToken();

    const fresh = refreshBody();
    fetchResolves(fresh);
    expect(await auth.getAccessToken()).toBe(fresh.accessToken);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("clamps absolute expiry up so a fast clock can't force refresh-per-call", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    // 10s absolute lifetime parses below the floor; clamped to >= 60s.
    fetchResolves(refreshBody({ expiresInMs: 10_000 }));
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("clamps absolute expiry down so a slow clock can't yield a never-stale token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      store.set(HINT, "1");
      const auth = makeAuth();
      const t0 = Date.now();
      fetchResolves(refreshBody({ expiresInMs: 24 * 3_600_000 }));
      await auth.getAccessToken();

      vi.setSystemTime(t0 + 11 * 60_000); // past the 10min ceiling
      fetchResolves(refreshBody());
      await auth.getAccessToken();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refresh", () => {
  it("collapses concurrent calls into a single request", async () => {
    const auth = makeAuth();
    let release;
    global.fetch.mockReturnValueOnce(new Promise((r) => (release = r)));

    const a = auth.refresh();
    const b = auth.refresh();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    release(new Response(JSON.stringify(refreshBody()), { status: 200 }));
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });

  it("allows a new request after the previous one settles", async () => {
    const auth = makeAuth();
    fetchResolves(refreshBody());
    await auth.refresh();
    fetchResolves(refreshBody());
    await auth.refresh();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("clears the session hint on 401 (no session / family revoked)", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    fetchResolves(undefined, 401);
    expect(await auth.refresh()).toBe(false);
    expect(store.has(HINT)).toBe(false);
  });

  it("keeps the session hint on a network failure so the next visit retries", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    global.fetch.mockRejectedValueOnce(new Error("offline"));
    expect(await auth.refresh()).toBe(false);
    expect(store.get(HINT)).toBe("1");
  });

  it("sets the session hint after a successful refresh", async () => {
    const auth = makeAuth();
    fetchResolves(refreshBody());
    expect(await auth.refresh()).toBe(true);
    expect(store.get(HINT)).toBe("1");
  });
});

describe("claims", () => {
  it("decodes the base64url payload of the held token", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    const payload = { sub: "u1", azp: KEY, roles: ["cms:access"] };
    fetchResolves(refreshBody({ payload }));
    await auth.getAccessToken();
    expect(auth.claims()).toEqual(payload);
  });

  it("returns null without a token", () => {
    expect(makeAuth().claims()).toBeNull();
  });
});

describe("buildLoginUrl", () => {
  it("targets /auth/login with the clientKey and a marked, cleaned redirectUri", () => {
    const url = buildLoginUrl(BASE, KEY, "https://site.test/page?cms-login=1&x=1");
    expect(url.startsWith(`${BASE}/auth/login?clientKey=${KEY}&redirectUri=`)).toBe(true);

    const redirect = new URL(decodeURIComponent(url.split("redirectUri=")[1]));
    expect(redirect.origin + redirect.pathname).toBe("https://site.test/page");
    expect(redirect.searchParams.has("cms-login")).toBe(false);
    expect(redirect.searchParams.get("cms-auth")).toBe("done");
    expect(redirect.searchParams.get("x")).toBe("1");
  });
});

describe("logout", () => {
  it("POSTs /auth/logout and drops token + hint", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    fetchResolves(refreshBody());
    await auth.refresh();

    fetchResolves(undefined, 204);
    await auth.logout();

    expect(global.fetch).toHaveBeenLastCalledWith(
      `${BASE}/auth/logout`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(store.has(HINT)).toBe(false);
    expect(await auth.getAccessToken()).toBe("");
  });

  it("drops local state even when the backend is unreachable", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    fetchResolves(refreshBody());
    await auth.refresh();

    global.fetch.mockRejectedValueOnce(new Error("offline"));
    await auth.logout();
    expect(store.has(HINT)).toBe(false);
  });
});

describe("onChange", () => {
  it("emits transitions only: signed-in once, silence on renewal, expired on 401", async () => {
    store.set(HINT, "1");
    const auth = makeAuth();
    const events = [];
    auth.onChange((ok, reason) => events.push([ok, reason]));

    fetchResolves(refreshBody());
    await auth.refresh();
    fetchResolves(refreshBody()); // renewal with a held token: no emit
    await auth.refresh();
    fetchResolves(undefined, 401);
    await auth.refresh();

    expect(events).toEqual([
      [true, "signed-in"],
      [false, "expired"],
    ]);
  });

  it("stays silent when an anonymous probe finds no session", async () => {
    const auth = makeAuth();
    const events = [];
    auth.onChange((ok, reason) => events.push([ok, reason]));
    fetchResolves(undefined, 401);
    await auth.refresh();
    expect(events).toEqual([]);
  });

  it("emits logout", async () => {
    const auth = makeAuth();
    const events = [];
    auth.onChange((ok, reason) => events.push([ok, reason]));
    fetchResolves(undefined, 204);
    await auth.logout();
    expect(events).toEqual([[false, "logout"]]);
  });

  it("stops delivering after unsubscribe", async () => {
    const auth = makeAuth();
    const events = [];
    const off = auth.onChange((ok, reason) => events.push([ok, reason]));
    off();
    fetchResolves(refreshBody());
    await auth.refresh();
    expect(events).toEqual([]);
  });
});

describe("getBrowserAuth", () => {
  it("returns one shared instance per baseUrl+clientKey", () => {
    const a = getBrowserAuth({ baseUrl: BASE, clientKey: "cache-a" });
    const b = getBrowserAuth({ baseUrl: BASE, clientKey: "cache-a" });
    const c = getBrowserAuth({ baseUrl: BASE, clientKey: "cache-b" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
