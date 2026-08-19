/**
 * What an SSR content fetch does when it fails.
 *
 * The bug behind these tests: a caught failure rendered an empty page, and with
 * `revalidate: false` that empty render was stored in the Full Route Cache
 * indefinitely. Nothing dropped it on its own, so a seconds-long outage could
 * outlive itself by weeks, and a blip during `next build` could ship a green
 * deploy carrying an empty site.
 *
 * `unstable_noStore` is mocked throughout: in Next it bails a static render out
 * by *throwing*, and asserting that our catch blocks let that throw escape is
 * half of what is being guarded here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const noStore = vi.fn();
vi.mock("next/cache", () => ({ unstable_noStore: () => noStore() }));

import { handleSsrFailure } from "../../server/ssr-failure.js";
import { getCmsPageBlocks } from "../../server/get-content.js";
import { CmsApiError } from "../../shared/contracts/errors.js";

const BASE = "https://api.test";
const PAGE = { kind: "page", target: "/haberler", locale: null };

const apiError = (status) => new CmsApiError({ status, detail: `boom ${status}` });

/** Next's own bail-out signal, which travels as an error through our catches. */
const dynamicSignal = () => Object.assign(new Error("bail"), { digest: "DYNAMIC_SERVER_USAGE" });

const originalPhase = process.env.NEXT_PHASE;

beforeEach(() => {
  noStore.mockReset();
  delete process.env.NEXT_PHASE;
});

afterEach(() => {
  if (originalPhase === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = originalPhase;
  vi.restoreAllMocks();
});

describe("a 404 is absence, not failure", () => {
  it("returns so the caller renders empty, and leaves the render cacheable", () => {
    expect(() => handleSsrFailure(apiError(404), PAGE)).not.toThrow();
    expect(noStore).not.toHaveBeenCalled();
  });

  it("is not reported: a page not yet synced is not an incident", () => {
    const onSsrError = vi.fn();
    handleSsrFailure(apiError(404), PAGE, onSsrError);
    expect(onSsrError).not.toHaveBeenCalled();
  });
});

describe("an unreachable backend", () => {
  it("keeps the render out of the cache", () => {
    // The mock stands in for a throw, so the call itself is what we assert.
    handleSsrFailure(apiError(503), PAGE);
    expect(noStore).toHaveBeenCalledTimes(1);
  });

  it("treats a bare network rejection the same, since it carries no status", () => {
    handleSsrFailure(new TypeError("fetch failed"), PAGE);
    expect(noStore).toHaveBeenCalledTimes(1);
  });

  it("reports through the seam, with what failed and where", () => {
    const onSsrError = vi.fn();
    const err = apiError(500);
    handleSsrFailure(err, { kind: "collection", target: "news" }, onSsrError);

    expect(onSsrError).toHaveBeenCalledTimes(1);
    expect(onSsrError.mock.calls[0][0]).toBe(err);
    expect(onSsrError.mock.calls[0][1]).toEqual({ kind: "collection", target: "news" });
  });

  it("survives a reporter that throws, rather than taking the page down with it", () => {
    const onSsrError = vi.fn(() => { throw new Error("sentry is down too"); });
    expect(() => handleSsrFailure(apiError(500), PAGE, onSsrError)).not.toThrow();
    expect(noStore).toHaveBeenCalledTimes(1);
  });
});

describe("during next build", () => {
  it("refuses, so an empty site cannot ship as a green deploy", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const err = apiError(503);
    expect(() => handleSsrFailure(err, PAGE)).toThrow(err);
    // Failing the build is the whole answer; no cache opt-out is needed.
    expect(noStore).not.toHaveBeenCalled();
  });

  it("still reports first, so the build log names the cause", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const onSsrError = vi.fn();
    expect(() => handleSsrFailure(apiError(503), PAGE, onSsrError)).toThrow();
    expect(onSsrError).toHaveBeenCalledTimes(1);
  });

  it("lets a 404 through, since absence is not what the build is guarding", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => handleSsrFailure(apiError(404), PAGE)).not.toThrow();
  });
});

describe("a framework signal", () => {
  it("passes straight through, since swallowing it cancels the bail-out", () => {
    const signal = dynamicSignal();
    expect(() => handleSsrFailure(signal, PAGE)).toThrow(signal);
  });

  it("is not an incident, so it is neither reported nor re-marked", () => {
    const onSsrError = vi.fn();
    expect(() => handleSsrFailure(dynamicSignal(), PAGE, onSsrError)).toThrow();
    expect(onSsrError).not.toHaveBeenCalled();
    expect(noStore).not.toHaveBeenCalled();
  });

  it("covers redirect and notFound, which travel the same way", () => {
    for (const digest of ["NEXT_REDIRECT", "NEXT_NOT_FOUND"]) {
      const signal = Object.assign(new Error(digest), { digest });
      expect(() => handleSsrFailure(signal, PAGE)).toThrow(signal);
    }
  });
});

describe("page and global blocks fail independently", () => {
  const pages = {
    "/haberler": { slug: "/haberler", blocks: [{ blockPath: "hero.title", blockType: "ShortText", value: "sayfa", sortOrder: 1, version: 1 }] },
    __global: { slug: "__global", blocks: [{ blockPath: "footer.copyright", blockType: "ShortText", value: "footer", sortOrder: 1, version: 1 }] },
  };

  const configWith = (transport) => ({ baseUrl: BASE, globalSlug: "__global", locales: [], transport });

  const transportOver = (impl) => ({
    getContent: vi.fn(impl),
    getCollection: vi.fn(),
    getCollectionItem: vi.fn(),
  });

  it("keeps the global blocks when the page's own fetch fails", async () => {
    // The regression: both fetches shared one catch, so a page-slug failure
    // discarded the header and footer that had arrived perfectly well.
    const transport = transportOver(async (slug) => {
      if (slug === "/haberler") throw apiError(404);
      return pages[slug];
    });

    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");
    expect(blocks.map((b) => b.blockPath)).toEqual(["footer.copyright"]);
  });

  it("keeps the page blocks when the global fetch fails", async () => {
    const transport = transportOver(async (slug) => {
      if (slug === "__global") throw apiError(404);
      return pages[slug];
    });

    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");
    expect(blocks.map((b) => b.blockPath)).toEqual(["hero.title"]);
  });

  it("names which half failed when it reports", async () => {
    const onSsrError = vi.fn();
    const transport = transportOver(async (slug) => {
      if (slug === "__global") throw apiError(500);
      return pages[slug];
    });

    await getCmsPageBlocks(configWith(transport), "/haberler", { onSsrError });

    expect(onSsrError).toHaveBeenCalledTimes(1);
    expect(onSsrError.mock.calls[0][1].kind).toBe("global");
    expect(onSsrError.mock.calls[0][1].target).toBe("__global");
  });
});
