/**
 * Tests for the server read helpers (`inscribed/server`). Everything is driven
 * through an injected fake `config.transport` (see ../lib/transport.js), so the
 * assertions are about what these helpers *decide* — which cache tags a response
 * is filed under, how page and global blocks merge, and how many times a service
 * token gets resolved — not about wire format, which transport.test.js owns.
 *
 * `config` is a plain object rather than `createCmsConfig(...)`: the factory
 * deliberately leaves `transport` out (config.js:28-31), since it holds
 * functions and is resolved at the use site.
 */
import { describe, it, expect, vi } from "vitest";

import {
  cmsCacheTag,
  cmsCollectionTag,
  cmsCollectionItemTag,
  getCmsContent,
  getCmsCollection,
  getCmsCollectionItem,
  getCmsPageBlocks,
} from "../server/get-content.js";
import { noServiceToken } from "../defaults/service-token.js";

const BASE = "https://api.test";

const block = (blockPath, extra = {}) => ({
  blockPath,
  blockType: "ShortText",
  value: `${blockPath} yayında`,
  sortOrder: 1,
  version: 1,
  ...extra,
});

const row = (slug, extra = {}) => ({
  id: `row-${slug}`,
  collectionKey: "news",
  slug,
  data: { title: slug },
  version: 1,
  canEdit: false,
  ...extra,
});

/**
 * @param {{ pages?: Record<string, { slug: string, blocks: *[] }>, list?: *, item?: * }} [seed]
 */
function fakeTransport({ pages = {}, list, item } = {}) {
  return {
    getContent: vi.fn(async (slug) => pages[slug] ?? { slug, blocks: [] }),
    getCollection: vi.fn(async () => list ?? { items: [], total: 0, offset: 0, limit: 50 }),
    getCollectionItem: vi.fn(async (key, slug) => item ?? row(slug)),
  };
}

const configWith = (transport, extra = {}) => ({
  baseUrl: BASE,
  cdnUrl: null,
  clientKey: null,
  globalSlug: "__global",
  theme: null,
  transport,
  ...extra,
});

/** The `cache` hint the transport was handed on its Nth call. */
const cacheOf = (fn, n = 0) => fn.mock.calls[n].at(-1).cache;

describe("cache tags", () => {
  it("namespaces page, collection and record tags apart", () => {
    expect(cmsCacheTag("/haberler")).toBe("cms-/haberler");
    expect(cmsCollectionTag("news")).toBe("cms-collection-news");
    expect(cmsCollectionItemTag("news", "q1")).toBe("cms-collection-news-q1");
  });

  it("files a page under its slug tag and defers to tag-only invalidation", async () => {
    const transport = fakeTransport();
    await getCmsContent(configWith(transport), "/haberler");

    expect(cacheOf(transport.getContent)).toEqual({
      revalidate: false,
      tags: ["cms-/haberler"],
    });
  });

  it("appends caller tags after the helper's own and honours revalidate", async () => {
    const transport = fakeTransport();
    await getCmsContent(configWith(transport), "/haberler", {
      revalidate: 60,
      tags: ["kampanya"],
    });

    expect(cacheOf(transport.getContent)).toEqual({
      revalidate: 60,
      tags: ["cms-/haberler", "kampanya"],
    });
  });

  it("files every window of a collection under one tag", async () => {
    const transport = fakeTransport();
    const config = configWith(transport);
    await getCmsCollection(config, "news", { limit: 5 });
    await getCmsCollection(config, "news", { offset: 5, limit: 5 });

    // A single write moves rows between windows, so there is nothing finer to
    // invalidate safely: both windows must share the tag.
    expect(cacheOf(transport.getCollection, 0).tags).toEqual(["cms-collection-news"]);
    expect(cacheOf(transport.getCollection, 1).tags).toEqual(["cms-collection-news"]);
  });

  it("gives a record both its own tag and the collection's", async () => {
    const transport = fakeTransport();
    await getCmsCollectionItem(configWith(transport), "news", "q1", { tags: ["detay"] });

    expect(cacheOf(transport.getCollectionItem).tags).toEqual([
      "cms-collection-news-q1",
      "cms-collection-news",
      "detay",
    ]);
  });
});

describe("page + global merge", () => {
  const pages = {
    "/haberler": { slug: "/haberler", blocks: [block("hero.title"), block("hero.body")] },
    __global: { slug: "__global", blocks: [block("footer.copyright")] },
  };

  it("stamps every block with the slug it must be PUT back to", async () => {
    const transport = fakeTransport({ pages });
    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");

    expect(blocks.map((b) => [b.blockPath, b._slug])).toEqual([
      ["hero.title", "/haberler"],
      ["hero.body", "/haberler"],
      ["footer.copyright", "__global"],
    ]);
  });

  it("keeps the page's block on a path collision and drops the global twin", async () => {
    const transport = fakeTransport({
      pages: {
        "/haberler": { slug: "/haberler", blocks: [block("hero.title", { value: "sayfa" })] },
        __global: {
          slug: "__global",
          blocks: [block("hero.title", { value: "global" }), block("footer.copyright")],
        },
      },
    });
    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");

    expect(blocks.map((b) => b.blockPath)).toEqual(["hero.title", "footer.copyright"]);
    expect(blocks[0].value).toBe("sayfa");
    expect(blocks[0]._slug).toBe("/haberler");
  });

  it("renders the page when the global fetch fails", async () => {
    const transport = fakeTransport({ pages });
    transport.getContent.mockImplementation(async (slug) => {
      if (slug === "__global") throw new Error("backend down");
      return pages[slug];
    });

    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");
    expect(blocks.map((b) => b.blockPath)).toEqual(["hero.title", "hero.body"]);
  });

  it("does not fetch the global slug twice when the page is the global slug", async () => {
    const transport = fakeTransport({ pages });
    await getCmsPageBlocks(configWith(transport), "__global");

    expect(transport.getContent).toHaveBeenCalledTimes(1);
    expect(transport.getContent.mock.calls[0][0]).toBe("__global");
  });
});

describe("service token", () => {
  it("reads unauthenticated by default", async () => {
    expect(await noServiceToken()).toBe("");

    const transport = fakeTransport();
    await getCmsContent(configWith(transport), "/haberler");
    expect(transport.getContent.mock.calls[0][1].accessToken).toBe("");
  });

  it("resolves the token once for a page and its global", async () => {
    const getServiceToken = vi.fn(async () => "svc");
    const transport = fakeTransport();
    await getCmsPageBlocks(configWith(transport, { getServiceToken }), "/haberler");

    // `getCmsPageBlocks` passes the resolved token down as `contentOptions.
    // accessToken`, and `getCmsContent`'s `?? await getServiceToken()` then
    // short-circuits on it — including on the empty-string default, which is
    // not nullish.
    expect(getServiceToken).toHaveBeenCalledTimes(1);
    expect(transport.getContent).toHaveBeenCalledTimes(2);
    for (const call of transport.getContent.mock.calls) {
      expect(call[1].accessToken).toBe("svc");
    }
  });

  it("never resolves a token when the caller supplies one", async () => {
    const getServiceToken = vi.fn(async () => "svc");
    const transport = fakeTransport();
    await getCmsPageBlocks(configWith(transport, { getServiceToken }), "/haberler", {
      contentOptions: { accessToken: "onizleme" },
    });

    expect(getServiceToken).not.toHaveBeenCalled();
    expect(transport.getContent.mock.calls[0][1].accessToken).toBe("onizleme");
  });
});

describe("caller tags on the shared global fetch", () => {
  it("keeps a page-scoped tag off the shared __global entry", async () => {
    const transport = fakeTransport({
      pages: {
        "/haberler": { slug: "/haberler", blocks: [block("hero.title")] },
        __global: { slug: "__global", blocks: [block("footer.copyright")] },
      },
    });
    await getCmsPageBlocks(configWith(transport), "/haberler", {
      contentOptions: { tags: ["kampanya"] },
    });

    // `__global` is one cache entry behind every page: a per-page tag on it
    // would let that page's revalidate drop everyone's header/footer. The
    // page's own fetch keeps the caller tag.
    const globalCall = transport.getContent.mock.calls.find(([slug]) => slug === "__global");
    expect(globalCall[1].cache.tags).toEqual(["cms-__global"]);
    const pageCall = transport.getContent.mock.calls.find(([slug]) => slug === "/haberler");
    expect(pageCall[1].cache.tags).toContain("kampanya");
  });
});

// ---------------------------------------------------------------------------
// RED until Faz 5 / G2: `includeDrafts` does not exist yet, so every case below
// fails today. The chain it closes: the transport branches on the credential
// (transport.js:59-67), get-content.js:118 passes `draftValue` through
// untouched, and EditableRegion.jsx:119 renders `draftValue ?? value` for a
// *visitor* before the admin branch at :130 — under `cmsCacheTag(slug)`, so an
// unpublished draft can be baked into public HTML and ISR.
// ---------------------------------------------------------------------------

describe("includeDrafts", () => {
  const draftedPages = {
    "/haberler": {
      slug: "/haberler",
      blocks: [block("hero.title", { draftValue: "taslak başlık" })],
    },
    __global: {
      slug: "__global",
      blocks: [block("footer.copyright", { draftValue: "taslak footer" })],
    },
  };

  it("strips draftValue from a page read", async () => {
    const transport = fakeTransport({ pages: draftedPages });
    const content = await getCmsContent(configWith(transport), "/haberler");

    // Dropped or nulled: either keeps the draft off the wire.
    expect(content.blocks[0].draftValue ?? null).toBeNull();
    expect(content.blocks[0].value).toBe("hero.title yayında");
  });

  it("preserves draftValue only when the caller asks for it", async () => {
    const transport = fakeTransport({ pages: draftedPages });
    const content = await getCmsContent(configWith(transport), "/haberler", {
      includeDrafts: true,
    });

    expect(content.blocks[0].draftValue).toBe("taslak başlık");
  });

  it("strips draftValue from both halves of the page+global merge", async () => {
    const transport = fakeTransport({ pages: draftedPages });
    const blocks = await getCmsPageBlocks(configWith(transport), "/haberler");

    expect(blocks).toHaveLength(2);
    for (const b of blocks) expect(b.draftValue ?? null).toBeNull();
  });

  it("strips draftData from a collection window", async () => {
    const transport = fakeTransport({
      list: {
        items: [row("q1", { draftData: { title: "taslak" } }), row("q2")],
        total: 2,
        offset: 0,
        limit: 50,
      },
    });
    const page = await getCmsCollection(configWith(transport), "news");

    expect(page.items[0].draftData ?? null).toBeNull();
    expect(page.items[0].data).toEqual({ title: "q1" });
  });

  it("strips draftData from a single record", async () => {
    const transport = fakeTransport({ item: row("q1", { draftData: { title: "taslak" } }) });
    const item = await getCmsCollectionItem(configWith(transport), "news", "q1");

    expect(item.draftData ?? null).toBeNull();
  });

  it("keeps stripping even when a write-capable service token is in play", async () => {
    const transport = fakeTransport({ pages: draftedPages });
    const config = configWith(transport, { getServiceToken: async () => "content-write-svc" });
    const blocks = await getCmsPageBlocks(config, "/haberler");

    // Intent is never inferred from the credential: a consumer building a
    // preview says so with `includeDrafts`, and hands the token in through
    // `config.getServiceToken` either way.
    for (const b of blocks) expect(b.draftValue ?? null).toBeNull();
  });
});
