import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { syncAll } from "../../server/sync-manifest.js";

const BASE = "https://api.test";
const manifests = [{ slug: "/", blocks: [] }];

/** @param {*} body */
function backendAnswers(body) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

/** @returns {URL} */
function requestUrl() {
  return new URL(global.fetch.mock.calls[0][0]);
}

let log;
let warn;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncAll reseed", () => {
  it("prints how many blocks each slug had rewritten", async () => {
    backendAnswers({
      results: [{ slug: "/", created: 0, deleted: 0, unchanged: 3, reseeded: 2 }],
      prunedSlugs: [],
    });
    await syncAll(manifests, { baseUrl: BASE, reseed: true });

    expect(requestUrl().searchParams.get("reseed")).toBe("true");
    expect(log).toHaveBeenCalledWith("[inscribed-sync] / | created=0 deleted=0 unchanged=3 reseeded=2");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when the backend answers a reseed without reseed counts", async () => {
    // A backend that predates the flag ignores it, and its answer is otherwise
    // indistinguishable from one that found nothing to rewrite.
    backendAnswers({ results: [{ slug: "/", created: 0, deleted: 0, unchanged: 3 }], prunedSlugs: [] });
    await syncAll(manifests, { baseUrl: BASE, reseed: true });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("may not support reseeding"));
  });

  it("leaves a plain sync exactly as it was", async () => {
    backendAnswers({ results: [{ slug: "/", created: 0, deleted: 0, unchanged: 3 }], prunedSlugs: [] });
    await syncAll(manifests, { baseUrl: BASE });

    expect(requestUrl().searchParams.has("reseed")).toBe(false);
    expect(log).toHaveBeenCalledWith("[inscribed-sync] / | created=0 deleted=0 unchanged=3");
    expect(warn).not.toHaveBeenCalled();
  });
});
