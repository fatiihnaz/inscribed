import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRestTransport } from "../../defaults/transport.js";
import { CmsApiError } from "../../shared/contracts/errors.js";

/**
 * Contract test for the default REST transport. The core only ever sees the
 * `CmsTransport` shape (see ../../shared/contracts/transport.js); these assertions pin the
 * wire behaviour every custom backend adapter must match: endpoint paths,
 * Bearer headers, the opaque `cache` -> Next.js mapping, and `CmsApiError`
 * on non-2xx.
 */

const BASE = "https://api.test";

/** Resolve the next fetch() call with a JSON body and status. */
function fetchResolves(body, status = 200) {
  global.fetch.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** [url, init] of the most recent fetch() call. */
function lastCall() {
  return global.fetch.mock.calls.at(-1);
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("getContent", () => {
  it("GETs /cms/content?slug= and returns the parsed body", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ slug: "home", blocks: [] });

    const out = await t.getContent("home");

    const [url, init] = lastCall();
    expect(url).toContain(`${BASE}/cms/content`);
    expect(new URL(url).searchParams.get("slug")).toBe("home");
    expect(init.method).toBe("GET");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(out).toEqual({ slug: "home", blocks: [] });
  });

  it("attaches Authorization only when an accessToken is given", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[1].headers.Authorization).toBeUndefined();

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { accessToken: "tok" });
    expect(lastCall()[1].headers.Authorization).toBe("Bearer tok");
  });

  it("routes tokenless reads through the public endpoint when clientKey is set", async () => {
    const t = createRestTransport({ baseUrl: BASE, clientKey: "my-site" });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    const [url] = lastCall();
    expect(url).toContain(`${BASE}/cms/public/my-site/content`);
    expect(new URL(url).searchParams.get("slug")).toBe("home");

    // A token (user or service) always goes to `/cms/content`; the backend
    // decides from the credential whether drafts ride along.
    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { accessToken: "tok" });
    expect(lastCall()[0]).toContain(`${BASE}/cms/content`);
  });

  it("keeps /cms/content for tokenless reads without a clientKey", async () => {
    fetchResolves({ slug: "home", blocks: [] });
    await createRestTransport({ baseUrl: BASE }).getContent("home");
    expect(lastCall()[0]).toContain(`${BASE}/cms/content`);
  });

  it("maps the opaque cache hint onto Next.js' next: { revalidate, tags }", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { cache: { revalidate: 60, tags: ["cms"] } });
    expect(lastCall()[1].next).toEqual({ revalidate: 60, tags: ["cms"] });

    // No cache hint -> no `next` key at all (plain fetch).
    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[1].next).toBeUndefined();
  });

  it("throws a CmsApiError carrying status + detail on non-2xx", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Not Found", detail: "no such page", status: 404 }, 404);

    await expect(t.getContent("missing")).rejects.toMatchObject({
      name: "CmsApiError",
      status: 404,
      detail: "no such page",
    });
  });

  it("surfaces 404 via the isNotFound helper", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Not Found", detail: "gone", status: 404 }, 404);
    const err = await t.getContent("x").catch((e) => e);
    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isNotFound).toBe(true);
  });
});

describe("getCollection", () => {
  it("builds the list URL with filter, offset and limit query params", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 10, limit: 5 });

    await t.getCollection("News", { filter: { status: "active" }, offset: 10, limit: 5 });

    const sp = new URL(lastCall()[0]).searchParams;
    expect(lastCall()[0]).toContain(`${BASE}/cms/collections/News`);
    expect(sp.get("status")).toBe("active");
    expect(sp.get("offset")).toBe("10");
    expect(sp.get("limit")).toBe("5");
  });

  it("URL-encodes the collection key", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 0, limit: 0 });
    await t.getCollection("My Teams");
    expect(lastCall()[0]).toContain("/cms/collections/My%20Teams");
  });

  it("skips null/undefined filter values", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 0, limit: 0 });
    await t.getCollection("News", { filter: { status: null, category: "tech" } });
    const sp = new URL(lastCall()[0]).searchParams;
    expect(sp.has("status")).toBe(false);
    expect(sp.get("category")).toBe("tech");
  });

  it("coerces a bare array body into the paged envelope shape", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves([{ id: "1" }, { id: "2" }]);
    const out = await t.getCollection("News", { offset: 0, limit: 50 });
    expect(out).toEqual({ items: [{ id: "1" }, { id: "2" }], total: 2, offset: 0, limit: 50 });
  });

  it("passes an already-enveloped body through unchanged", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const envelope = { items: [{ id: "1" }], total: 99, offset: 0, limit: 1 };
    fetchResolves(envelope);
    expect(await t.getCollection("News")).toEqual(envelope);
  });
});

describe("updateContent", () => {
  it("PUTs the request body to /cms/content", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const request = { slug: "home", blocks: [{ blockPath: "hero.title", value: "Hi", version: 1 }] };
    fetchResolves({ updated: 1, unchanged: 0 });

    const out = await t.updateContent(request, { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/cms/content`);
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual(request);
    expect(out).toEqual({ updated: 1, unchanged: 0 });
  });

  it("throws CmsApiError on a 409 conflict and exposes every clashing block", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const conflicts = [
      { path: "hero.title", expected: 4, provided: 1 },
      { path: "cover", expected: 2, provided: 1 },
    ];
    fetchResolves({ title: "Conflict", detail: "version mismatch", status: 409, conflicts }, 409);
    const err = await t.updateContent({ slug: "home", blocks: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isConflict).toBe(true);
    expect(err.conflicts).toEqual(conflicts);
  });

  it("leaves conflicts null on a 409 that carries no block-level expectation", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    // A plain write race: the backend omits the key rather than sending [].
    fetchResolves({ title: "Conflict", detail: "write race", status: 409 }, 409);
    const err = await t.updateContent({ slug: "home", blocks: [] }).catch((e) => e);
    expect(err.isConflict).toBe(true);
    expect(err.conflicts).toBe(null);
  });

  it("keeps an empty conflicts array distinct from a missing one", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Conflict", detail: "none", status: 409, conflicts: [] }, 409);
    const err = await t.updateContent({ slug: "home", blocks: [] }).catch((e) => e);
    expect(err.conflicts).toEqual([]);
  });
});

describe("draft discard", () => {
  it("DELETEs /cms/draft?slug= for deleteDraft", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves(undefined, 204);

    await t.deleteDraft("home", { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(url).toContain(`${BASE}/cms/draft`);
    expect(new URL(url).searchParams.get("slug")).toBe("home");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("DELETEs /cms/collections/{key}/{slug}/draft for deleteCollectionItemDraft", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves(undefined, 204);

    await t.deleteCollectionItemDraft("News", "my-slug", { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/cms/collections/News/my-slug/draft`);
    expect(init.method).toBe("DELETE");
  });

  it("DELETEs /cms/collections/{key}/drafts for deleteCollectionNewDraft", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves(undefined, 204);

    await t.deleteCollectionNewDraft("News", { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/cms/collections/News/drafts`);
    expect(init.method).toBe("DELETE");
  });

  it("throws CmsApiError on a non-2xx delete", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Not Found", detail: "no draft", status: 404 }, 404);
    const err = await t.deleteDraft("home").catch((e) => e);
    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isNotFound).toBe(true);
  });
});

describe("archive and restore", () => {
  it("DELETEs the item with the version in the query string", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ collectionKey: "News", slug: "my-slug", version: 3 });

    await t.archiveCollectionItem("News", "my-slug", 3, { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(init.method).toBe("DELETE");
    expect(url).toContain(`${BASE}/cms/collections/News/my-slug`);
    expect(new URL(url).searchParams.get("version")).toBe("3");
  });

  it("POSTs restore without a version", async () => {
    // Archiving does not consume the version, so there is nothing for a
    // restore to disagree with and the endpoint takes none.
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ id: "row-1", slug: "my-slug", version: 3 });

    await t.restoreCollectionItem("News", "my-slug", { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(init.method).toBe("POST");
    expect(url).toBe(`${BASE}/cms/collections/News/my-slug/restore`);
  });

  it("surfaces the archived reason on a 409", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves(
      { title: "Conflict", status: 409, reason: "archived", detail: "is archived" },
      409,
    );

    const err = await t.upsertCollectionItem("News", "my-slug", { data: {}, version: 2 })
      .catch((e) => e);

    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isConflict).toBe(true);
    expect(err.isArchivedConflict).toBe(true);
  });
});

describe("locale", () => {
  /** `?locale=` off the most recent fetch, or null when absent. */
  const localeOf = () => new URL(lastCall()[0]).searchParams.get("locale");

  it("rides as a query param on both content read paths", async () => {
    const t = createRestTransport({ baseUrl: BASE, clientKey: "my-site" });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { locale: "en" });
    expect(lastCall()[0]).toContain(`${BASE}/cms/public/my-site/content`);
    expect(localeOf()).toBe("en");

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { accessToken: "tok", locale: "en" });
    expect(lastCall()[0]).toContain(`${BASE}/cms/content`);
    expect(localeOf()).toBe("en");
  });

  it("rides as a query param on the writes too, leaving bodies untouched", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const body = { slug: "home", blocks: [{ blockPath: "a", value: "x", version: 1 }] };

    fetchResolves({ updated: 1, unchanged: 0 });
    await t.updateContent(body, { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");
    // The locale qualifies the request, it is not part of what is written:
    // the payload shape is the same one a single-language site sends.
    expect(JSON.parse(lastCall()[1].body)).toEqual(body);

    fetchResolves(undefined, 204);
    await t.updateDraft(body, { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");

    fetchResolves(undefined, 204);
    await t.deleteDraft("home", { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");
    expect(new URL(lastCall()[0]).searchParams.get("slug")).toBe("home");
  });

  it("is omitted entirely when the caller has none", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[0]).not.toContain("locale");

    fetchResolves(undefined, 204);
    await t.deleteDraft("home");
    expect(lastCall()[0]).not.toContain("locale");
  });

  it("declares the whole list on /cms/sync instead of addressing one language", async () => {
    // Sync is where the app tells the backend which languages exist, so the
    // config stays the single home for that list. The manifest body stays
    // locale-free: a slug is what a page is, not what language it is in.
    const t = createRestTransport({ baseUrl: BASE });
    const manifests = [{ slug: "/", blocks: [] }];

    fetchResolves({ results: [], prunedSlugs: [] });
    await t.syncManifests(manifests, { accessToken: "tok", locales: ["tr", "en"] });
    expect(new URL(lastCall()[0]).searchParams.get("locales")).toBe("tr,en");
    expect(localeOf()).toBeNull();
    expect(JSON.parse(lastCall()[1].body)).toEqual(manifests);

    // A single-language site declares nothing, which is how the backend keeps
    // its existing (empty) list rather than being told to clear it.
    fetchResolves({ results: [], prunedSlugs: [] });
    await t.syncManifests(manifests, { accessToken: "tok", locales: [] });
    expect(lastCall()[0]).toBe(`${BASE}/cms/sync`);

    fetchResolves({ results: [], prunedSlugs: [] });
    await t.syncManifests(manifests, { accessToken: "tok" });
    expect(lastCall()[0]).toBe(`${BASE}/cms/sync`);
  });

  it("comes off params for a collection list, since it narrows the window", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 0, limit: 50 });
    await t.getCollection("News", { locale: "en", limit: 5 }, { accessToken: "tok" });
    expect(localeOf()).toBe("en");
    expect(new URL(lastCall()[0]).searchParams.get("limit")).toBe("5");
  });

  it("carries the translation group on the two create-side endpoints", async () => {
    // Which group a new record joins qualifies the call rather than describing
    // the record, so it rides beside the locale and leaves the body alone.
    const t = createRestTransport({ baseUrl: BASE });
    const groupOf = () => new URL(lastCall()[0]).searchParams.get("translationGroup");

    fetchResolves({ id: "1", slug: "new-product", data: {} });
    await t.createCollectionItem(
      "News", { data: {} }, { accessToken: "tok", locale: "en", translationGroup: "8f3f" },
    );
    expect(localeOf()).toBe("en");
    expect(groupOf()).toBe("8f3f");
    expect(JSON.parse(lastCall()[1].body)).toEqual({ data: {} });

    fetchResolves(undefined, 204);
    await t.saveCollectionNewDraft(
      "News", { data: {} }, { accessToken: "tok", locale: "en", translationGroup: "8f3f" },
    );
    expect(groupOf()).toBe("8f3f");

    // A standalone record names no group; the backend starts a fresh one.
    fetchResolves({ id: "1", slug: "s", data: {} });
    await t.createCollectionItem("News", { data: {} }, { accessToken: "tok", locale: "en" });
    expect(groupOf()).toBeNull();
  });

  it("qualifies creates and the new-item draft slot, but no per-slug endpoint", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ id: "1", slug: "s", data: {} });
    await t.createCollectionItem("News", { data: {} }, { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");

    fetchResolves(undefined, 204);
    await t.saveCollectionNewDraft("News", { data: {} }, { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");

    fetchResolves(undefined, 204);
    await t.deleteCollectionNewDraft("News", { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");

    // PUT is the exception among per-slug endpoints: `version: null` is how a
    // virtual row becomes real, and that row has no language yet.
    fetchResolves({ id: "1", slug: "s", data: {} });
    await t.upsertCollectionItem("News", "s", { data: {}, version: null }, { accessToken: "tok", locale: "en" });
    expect(localeOf()).toBe("en");

    // A slug is unique across the whole collection, translations included, so
    // the read-only and draft endpoints already name one row in one language.
    fetchResolves({ id: "1", slug: "s", data: {} });
    await t.getCollectionItem("News", "s", { accessToken: "tok", locale: "en" });
    expect(lastCall()[0]).toBe(`${BASE}/cms/collections/News/s`);

    fetchResolves(undefined, 204);
    await t.deleteCollectionItemDraft("News", "s", { accessToken: "tok", locale: "en" });
    expect(lastCall()[0]).toBe(`${BASE}/cms/collections/News/s/draft`);
  });
});

describe("baseUrl normalisation", () => {
  it("strips trailing slashes before building paths", async () => {
    const t = createRestTransport({ baseUrl: "https://api.test///" });
    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[0]).toContain("https://api.test/cms/content");
    expect(lastCall()[0]).not.toContain("api.test//");
  });
});
