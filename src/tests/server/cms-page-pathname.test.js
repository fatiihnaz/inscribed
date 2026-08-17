/**
 * Tests the dev warning `<CmsPage>` prints when it has neither a `slug` prop
 * nor an `x-pathname` header. The fallback to "/" is unconditional; what these
 * pin down is *when it complains*, because the header is missing in two very
 * different situations: an app whose middleware never ran (broken, every page
 * reads the same blocks) and a matcher-excluded path like `/favicon.ico` that
 * 404'd through the root layout (nothing to fix). Only the request headers tell
 * them apart.
 */
import { describe, it, expect, vi } from "vitest";

const requestHeaders = { current: new Headers() };

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

/**
 * Render a slug-less `<CmsPage>` for a request carrying `headers`, and report
 * whether it warned. The module is re-imported per call because the warning is
 * latched once per process.
 *
 * @param {Record<string, string>} headers
 * @returns {Promise<boolean>}
 */
async function warnsFor(headers) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");

  requestHeaders.current = new Headers(headers);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const { CmsPage } = createCmsPage({
    config: { baseUrl: "https://api.test" },
    transport: { getContent: async (slug) => ({ slug, blocks: [] }) },
    Provider: () => null,
  });
  await CmsPage({ children: null });

  const warned = warn.mock.calls.some((call) => String(call[0]).includes('no "x-pathname"'));
  warn.mockRestore();
  return warned;
}

describe("missing x-pathname", () => {
  it("warns on a document navigation", async () => {
    expect(
      await warnsFor({ "sec-fetch-dest": "document", accept: "text/html,*/*;q=0.8" }),
    ).toBe(true);
  });

  it("warns on an RSC payload request", async () => {
    expect(await warnsFor({ rsc: "1", accept: "*/*" })).toBe(true);
  });

  it("stays quiet for a favicon 404 rendered through the root layout", async () => {
    expect(
      await warnsFor({
        "sec-fetch-dest": "image",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      }),
    ).toBe(false);
  });

  it("stays quiet for a crawler fetching /robots.txt", async () => {
    expect(await warnsFor({ accept: "*/*" })).toBe(false);
  });
});
