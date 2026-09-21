/**
 * The one thing that tells someone their site outgrew a design that ships it
 * whole. It fires once per process, and what makes it worth having is the
 * slugs it names: the total says there is a problem, the list says where.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("unexpected notFound"); },
  permanentRedirect: () => { throw new Error("unexpected redirect"); },
}));
vi.mock("next/cache", () => ({ unstable_noStore: () => {} }));

import { createCmsConfig } from "../../shared/config.js";

const BASE = "https://api.test";

/** A block whose value alone weighs `bytes`, so a page weighs what the test asked for. */
const heavy = (blockPath, bytes) => ({
  blockPath, blockType: "RichText", value: "x".repeat(bytes), version: 1, sortOrder: 1,
});

/**
 * Rendered twice, through a fresh module each time: the warning latches, and
 * both halves of that are the assertion.
 *
 * @param {object} site
 * @returns {Promise<string[]>} every warning, in order
 */
async function warningsFor(site) {
  vi.resetModules();
  const { createCmsPage } = await import("../../server/cms-page.jsx");
  const { CmsPage } = createCmsPage({
    config: createCmsConfig({ baseUrl: BASE }),
    Provider: () => null,
    transport: { getSiteContent: async () => site },
  });

  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await CmsPage({ children: null });
    await CmsPage({ children: null });
    return warn.mock.calls.map((args) => String(args[0]));
  } finally {
    // Clears `mock.calls` as well as restoring, so the read above comes first.
    warn.mockRestore();
  }
}

describe("the site payload warning", () => {
  it("stays quiet for a site that fits", async () => {
    const warnings = await warningsFor({
      pages: [{ slug: "/", blocks: [heavy("hero.body", 1_000)] }],
      global: [],
    });
    expect(warnings).toEqual([]);
  });

  it("names the heaviest slugs, largest first, when it does not", async () => {
    const warnings = await warningsFor({
      pages: [
        { slug: "/", blocks: [heavy("hero.body", 10_000)] },
        { slug: "/handbook", blocks: [heavy("body", 250_000)] },
        { slug: "/about", blocks: [heavy("body", 60_000)] },
      ],
      global: [{ slug: "__global", blocks: [heavy("footer.body", 2_000)] }],
    });

    // Once, however many routes render: the second call is the same site.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/serialize to 315 KB/);
    expect(warnings[0]).toMatch(/Heaviest: \/handbook \(244 KB\), \/about \(59 KB\), \/ \(10 KB\)\.$/);
    // The global slug counts toward the total but is nowhere near the top.
    expect(warnings[0]).not.toMatch(/__global/);
  });

  it("says nothing about what to do with the content it found", async () => {
    const warnings = await warningsFor({
      pages: [{ slug: "/handbook", blocks: [heavy("body", 400_000)] }],
      global: [],
    });
    expect(warnings[0]).not.toMatch(/collection/i);
  });
});
