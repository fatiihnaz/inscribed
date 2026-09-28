// @vitest-environment jsdom
/**
 * Component tests for CmsProvider's built-in browser-auth activation: the
 * consumer-auth-wins rule, the zero-traffic guarantee for anonymous visitors,
 * claims adoption + role gating, URL marker handling, and the session
 * lifecycle surfaces (expiry notice, cross-tab sign-out).
 *
 * Each test uses a unique clientKey: browser-auth instances are cached per
 * baseUrl+clientKey, so reuse would leak token state across tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { useContext } from "react";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";

// The drawer is heavyweight and lazy; activation logic never needs it.
vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CmsContext } from "../../shared/state/cms-context.js";
import { getBrowserAuth } from "../../defaults/browser-auth.js";
import { en } from "../../shared/i18n/en/index.js";

const BASE = "https://api.test";

let seq = 0;
const nextKey = () => `spec-${++seq}`;
const hintKey = (clientKey) => `inscribed:auth-hint:${clientKey}`;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const fakeJwt = (payload) => `${b64url({ alg: "none" })}.${b64url(payload)}.x`;

function goodRefreshBody(clientKey, claims = {}) {
  return {
    accessToken: fakeJwt({
      sub: "u1",
      azp: clientKey,
      roles: ["content:read", "content:write"],
      name: "Fatih",
      email: "f@x.test",
      ...claims,
    }),
    expiresInSeconds: 900,
  };
}

const jsonRes = (body, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

/** Per-test handler for POST /auth/refresh; CMS reads get safe empty bodies. */
let refreshImpl;

const refreshCalls = () =>
  global.fetch.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")).length;

function Probe() {
  const { isAdmin, userInfo } = useContext(CmsContext);
  return (
    <div>
      <span data-testid="is-admin">{String(isAdmin)}</span>
      <span data-testid="email">{userInfo?.email ?? ""}</span>
    </div>
  );
}

function renderCms(config, props = {}) {
  return render(
    <CmsProvider config={config} {...props}>
      <Probe />
    </CmsProvider>,
  );
}

const settle = () => new Promise((r) => setTimeout(r, 25));
const adminText = () => screen.getByTestId("is-admin").textContent;

beforeEach(() => {
  refreshImpl = () => jsonRes(undefined, 401);
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/auth/refresh")) return refreshImpl();
    if (url.includes("/cms/collections/me")) return jsonRes({ collections: [] });
    if (url.includes("/cms/content") || url.includes("/cms/public/")) {
      return jsonRes({ slug: "/", blocks: [] });
    }
    return jsonRes({});
  });
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("activation rule", () => {
  it("stays fully inert without a clientKey", async () => {
    renderCms({ baseUrl: BASE });
    await settle();
    expect(adminText()).toBe("false");
    expect(refreshCalls()).toBe(0);
  });

  it("stays fully inert when the consumer supplies getAccessToken, even with clientKey + hint", async () => {
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    renderCms({ baseUrl: BASE, clientKey: key }, { getAccessToken: async () => "consumer-tok" });
    await settle();
    expect(adminText()).toBe("false");
    expect(refreshCalls()).toBe(0);
  });

  it("makes zero auth requests for an anonymous visitor (no hint, no markers)", async () => {
    renderCms({ baseUrl: BASE, clientKey: nextKey() });
    await settle();
    expect(adminText()).toBe("false");
    expect(refreshCalls()).toBe(0);
  });
});

describe("session adoption", () => {
  it("silently resumes from a session hint and derives identity from claims", async () => {
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => jsonRes(goodRefreshBody(key));

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(adminText()).toBe("true"));
    expect(screen.getByTestId("email").textContent).toBe("f@x.test");
    expect(refreshCalls()).toBe(1);
  });

  it("stays public and warns when the token's azp is another client", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => jsonRes(goodRefreshBody("some-other-site"));

    renderCms({ baseUrl: BASE, clientKey: key });
    await settle();
    expect(adminText()).toBe("false");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no content:write"));
  });

  it("stays public when the capabilities are read-only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => jsonRes(goodRefreshBody(key, { roles: ["content:read"] }));

    renderCms({ baseUrl: BASE, clientKey: key });
    await settle();
    expect(adminText()).toBe("false");
  });

  it("handles the ?cms-auth=done return: refreshes, adopts, and strips only the marker", async () => {
    const key = nextKey();
    refreshImpl = () => jsonRes(goodRefreshBody(key));
    window.history.replaceState(null, "", "/?cms-auth=done&x=1");

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(adminText()).toBe("true"));
    expect(window.location.search).not.toContain("cms-auth");
    expect(window.location.search).toContain("x=1");
  });

  it("handles ?cms-logout: signs out instead of resuming, clears the hint, strips only the marker", async () => {
    const key = nextKey();
    // Hint + a good refresh would normally resume as admin; ?cms-logout must
    // pre-empt that path entirely and never adopt the session.
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => jsonRes(goodRefreshBody(key));
    window.history.replaceState(null, "", "/?cms-logout&x=1");

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() =>
      expect(global.fetch.mock.calls.some((c) => String(c[0]).includes("/auth/logout"))).toBe(true),
    );
    await settle();
    expect(adminText()).toBe("false");
    expect(refreshCalls()).toBe(0);
    expect(localStorage.getItem(hintKey(key))).toBeNull();
    expect(window.location.search).not.toContain("cms-logout");
    expect(window.location.search).toContain("x=1");
  });
});

describe("session lifecycle", () => {
  /** Sign in via hint-resume, then return the live auth instance. */
  async function signIn(key) {
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => jsonRes(goodRefreshBody(key));
    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(adminText()).toBe("true"));
    return getBrowserAuth({ baseUrl: BASE, clientKey: key });
  }

  it("drops to public and raises the notice when the session expires mid-edit", async () => {
    const key = nextKey();
    const auth = await signIn(key);

    refreshImpl = () => jsonRes(undefined, 401);
    await act(async () => {
      await auth.refresh();
    });

    await waitFor(() => expect(adminText()).toBe("false"));
    // The notice is its own chunk (it carries the panel's wording), so it
    // arrives a beat after the session drops.
    expect(await screen.findByText(en["core.session.expired"])).toBeTruthy();
  });

  it("drops to public silently (no notice) when another tab signs out", async () => {
    const key = nextKey();
    await signIn(key);

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: hintKey(key), newValue: null }));
    });

    await waitFor(() => expect(adminText()).toBe("false"));
    expect(screen.queryByText(en["core.session.expired"])).toBeNull();
  });

  it("keeps the session when the provider remounts, as it does on a language switch", async () => {
    const key = nextKey();
    await signIn(key);
    cleanup();

    renderCms({ baseUrl: BASE, clientKey: key });
    expect(adminText()).toBe("true");
    expect(screen.getByTestId("email").textContent).toBe("f@x.test");
    await settle();
    expect(refreshCalls()).toBe(1);
  });

  it("keeps the editor through a lost connection and picks up again once back online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = nextKey();
    const auth = await signIn(key);

    refreshImpl = () => Promise.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      await auth.refresh();
    });
    expect(adminText()).toBe("true");

    refreshImpl = () => jsonRes(goodRefreshBody(key));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(refreshCalls()).toBe(3));
    expect(adminText()).toBe("true");
  });

  it("adopts the session when another tab signs in", async () => {
    const key = nextKey();
    refreshImpl = () => jsonRes(goodRefreshBody(key));
    renderCms({ baseUrl: BASE, clientKey: key });
    await settle();
    expect(adminText()).toBe("false");

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: hintKey(key), newValue: "1" }));
    });

    await waitFor(() => expect(adminText()).toBe("true"));
  });
});

describe("while a returning editor's session resolves", () => {
  const shell = () => document.querySelector(".inscribed-page-shell");

  /** Holds the refresh open until the test answers it. */
  function holdRefresh() {
    let answer;
    refreshImpl = () => new Promise((resolve) => { answer = resolve; });
    return (res) => answer(res);
  }

  it("makes room for the drawer, then hands the page to the editor", async () => {
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    const answer = holdRefresh();

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(shell()).toBeTruthy());
    expect(adminText()).toBe("false");

    await act(async () => {
      answer(jsonRes(goodRefreshBody(key)));
    });
    await waitFor(() => expect(adminText()).toBe("true"));
    expect(shell()).toBeTruthy();
  });

  it("gives the room back when there turns out to be no session", async () => {
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    const answer = holdRefresh();

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(shell()).toBeTruthy());

    await act(async () => {
      answer(jsonRes(undefined, 401));
    });
    await waitFor(() => expect(shell()).toBeNull());
    expect(adminText()).toBe("false");
  });

  it("stays while the backend is unreachable and resumes once it answers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = nextKey();
    localStorage.setItem(hintKey(key), "1");
    refreshImpl = () => Promise.reject(new TypeError("Failed to fetch"));

    renderCms({ baseUrl: BASE, clientKey: key });
    await waitFor(() => expect(refreshCalls()).toBe(1));
    await settle();
    expect(shell()).toBeTruthy();
    expect(adminText()).toBe("false");

    refreshImpl = () => jsonRes(goodRefreshBody(key));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(adminText()).toBe("true"));
  });
});
