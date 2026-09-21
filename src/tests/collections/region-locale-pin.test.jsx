// @vitest-environment jsdom
/**
 * What `locale` on a client `<CollectionRegion>` addresses, so it means the
 * same thing as on the server-rendered one: absent is the route's language,
 * a string pins another, and `null` asks for the collection's own default.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => { const Noop = () => null; return Noop; } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { CollectionRegion } from "../../collections/CollectionRegion.jsx";
import { createCmsConfig } from "../../shared/config.js";

const CONFIG = createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"] });
const EMPTY_SITE = { pages: [], global: [] };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** @param {Record<string, *>} props */
async function paramsSentFor(props) {
  const getCollection = vi.fn(async () => ({ items: [], total: 0, offset: 0, limit: 50 }));
  render(
    <CmsProvider config={CONFIG} initialSite={EMPTY_SITE} transport={{ getCollection }} collections={CollectionProvider}>
      <CollectionRegion collection="news" {...props}><span /></CollectionRegion>
    </CmsProvider>,
  );
  await waitFor(() => expect(getCollection).toHaveBeenCalledTimes(1));
  return getCollection.mock.calls[0][1];
}

describe("<CollectionRegion locale> on the client, under /en", () => {
  it("absent: the route's language", async () => {
    expect(await paramsSentFor({})).toEqual({ locale: "en" });
  });

  it("a string: that language, whatever the route says", async () => {
    expect(await paramsSentFor({ locale: "tr" })).toEqual({ locale: "tr" });
  });

  it("null: no language at all, which is the collection's own default", async () => {
    // The server-rendered region already reads null this way. Filling the
    // route's language in here would make one prop mean two things.
    expect(await paramsSentFor({ locale: null, limit: 5 })).toEqual({ limit: 5 });
    expect(await paramsSentFor({ locale: null })).toBeUndefined();
  });
});
