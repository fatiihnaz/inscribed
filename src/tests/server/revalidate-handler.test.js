/**
 * The revalidation route: a backend that wrote around the drawer (a bot, an
 * import) names the collections it changed, and their tags are marked stale
 * the same way the publish actions mark them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/cache", () => cache);

import { createRevalidateHandler } from "../../server/revalidate.js";
import { cmsCollectionTag } from "../../server/get-content.js";

const SECRET = "s3cret-value";

/** @param {{ auth?: string | null, body?: string }} [init] */
function post({ auth = `Bearer ${SECRET}`, body = JSON.stringify({ collections: ["news"] }) } = {}) {
  /** @type {Record<string, string>} */
  const headers = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return new Request("https://site.test/cms-revalidate", { method: "POST", headers, body });
}

beforeEach(() => {
  cache.revalidateTag.mockClear();
  cache.updateTag.mockClear();
});

describe("the revalidation route", () => {
  it("marks each named collection stale with the max profile", async () => {
    const POST = createRevalidateHandler({ secret: SECRET });
    const res = await POST(post({ body: JSON.stringify({ collections: ["news", "staff"] }) }));

    expect(res.status).toBe(200);
    expect(cache.revalidateTag.mock.calls).toEqual([
      [cmsCollectionTag("news"), "max"],
      [cmsCollectionTag("staff"), "max"],
    ]);
    expect(cache.updateTag).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ revalidated: [cmsCollectionTag("news"), cmsCollectionTag("staff")] });
  });

  it("adds the app's own tags for the changed collections, once each", async () => {
    const tags = vi.fn((collections) => (collections.includes("staff") ? ["schedule", "schedule"] : []));
    const POST = createRevalidateHandler({ secret: SECRET, tags });
    await POST(post({ body: JSON.stringify({ collections: ["staff"] }) }));

    expect(tags).toHaveBeenCalledWith(["staff"]);
    expect(cache.revalidateTag.mock.calls).toEqual([
      [cmsCollectionTag("staff"), "max"],
      ["schedule", "max"],
    ]);
  });

  it("refuses a request without the secret or with another one", async () => {
    const POST = createRevalidateHandler({ secret: SECRET });

    expect((await POST(post({ auth: null }))).status).toBe(401);
    expect((await POST(post({ auth: "Bearer wrong" }))).status).toBe(401);
    expect((await POST(post({ auth: SECRET }))).status).toBe(401);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses every request when no secret is configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = createRevalidateHandler({ secret: undefined });

    expect((await POST(post({ auth: "Bearer " }))).status).toBe(500);
    expect((await POST(post({ auth: "Bearer undefined" }))).status).toBe(500);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("answers 400 to a body that does not name collections", async () => {
    const POST = createRevalidateHandler({ secret: SECRET });

    for (const body of ["not json", "{}", JSON.stringify({ collections: "news" }), JSON.stringify({ collections: ["news", ""] })]) {
      expect((await POST(post({ body }))).status).toBe(400);
    }
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });
});
