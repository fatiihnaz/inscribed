/**
 * `transport.request` is the one method that names no endpoint of ours: it
 * exists so a custom admin panel can reach the routes an app puts on the same
 * backend beside the CMS API. So what is guarded here is mostly what it must
 * *not* do to the caller's path, plus the empty-body case that `res.json()`
 * would otherwise turn into a parse error.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

import { createRestTransport } from "../../defaults/transport.js";
import { CmsApiError } from "../../shared/contracts/errors.js";

const BASE = "https://api.test";
const transport = createRestTransport({ baseUrl: BASE });

/** Last [url, init] the transport sent. */
let sent;

function mockFetch(response) {
  sent = null;
  global.fetch = vi.fn(async (url, init) => {
    sent = [String(url), init];
    return response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("transport.request", () => {
  it("resolves against baseUrl itself, with no /cms prefix", async () => {
    mockFetch(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));
    const body = await transport.request("/admin/orders");

    expect(sent[0]).toBe(`${BASE}/admin/orders`);
    expect(body).toEqual([{ id: 1 }]);
  });

  it("tolerates a path written without its leading slash", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    await transport.request("admin/orders");

    expect(sent[0]).toBe(`${BASE}/admin/orders`);
  });

  it("leaves an absolute URL alone", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    await transport.request("https://elsewhere.test/hook");

    expect(sent[0]).toBe("https://elsewhere.test/hook");
  });

  it("attaches the caller's token as a bearer, and nothing when there is none", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    await transport.request("/admin/orders", { accessToken: "tok" });
    expect(sent[1].headers.Authorization).toBe("Bearer tok");

    mockFetch(new Response("{}", { status: 200 }));
    await transport.request("/admin/orders");
    expect(sent[1].headers.Authorization).toBeUndefined();
  });

  it("forwards method, body and extra headers, and keeps `accessToken` off the wire", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    await transport.request("/admin/sync", {
      method: "POST",
      body: "{}",
      headers: { "X-Trace": "abc" },
      accessToken: "tok",
    });

    expect(sent[1].method).toBe("POST");
    expect(sent[1].body).toBe("{}");
    expect(sent[1].headers["X-Trace"]).toBe("abc");
    expect(sent[1].accessToken).toBeUndefined();
  });

  it("answers an empty body with null rather than a parse error", async () => {
    mockFetch(new Response(null, { status: 204 }));
    expect(await transport.request("/admin/orders", { method: "DELETE" })).toBeNull();

    mockFetch(new Response("", { status: 200 }));
    expect(await transport.request("/admin/orders")).toBeNull();
  });

  it("maps a failure onto CmsApiError, like every other method", async () => {
    mockFetch(new Response(JSON.stringify({ detail: "nope" }), { status: 403 }));

    await expect(transport.request("/admin/orders")).rejects.toBeInstanceOf(CmsApiError);
  });
});
