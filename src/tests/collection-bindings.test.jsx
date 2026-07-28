// @vitest-environment jsdom
/**
 * Tests for the collection binding registry: identity comes from the record (or
 * filter window) a component points at, entries are refcounted so the same
 * record can be rendered many times, and a re-registration publishes nothing.
 * Mounted through the real CmsProvider/CollectionProvider stack with a mocked
 * fetch, same pattern as the composer tests.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { useEffect } from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/news",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../components/CmsProvider.jsx";
import { CollectionItem } from "../components/CollectionItem.jsx";
import { CollectionRegion } from "../components/CollectionRegion.jsx";
import { CmsGroup } from "../components/CmsGroup.jsx";
import {
  collectionItemBindingId,
  collectionRegionBindingId,
  useCollectionContext,
} from "../lib/collection-context.js";

const BASE = "https://api.test";

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch() {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    if (/\/cms\/collections\/news\/[^/?]+/.test(url)) {
      return jsonRes({
        id: "row-1",
        collectionKey: "news",
        slug: "q1",
        data: { title: "Q1" },
        version: 1,
        canEdit: false,
      });
    }
    if (url.includes("/cms/collections/news")) {
      return jsonRes({ items: [], total: 0, offset: 0, limit: 50 });
    }
    return jsonRes({ slug: "/news", blocks: [] });
  });
}

/** Every distinct registry Map the provider published, oldest first. */
let published;

function Probe() {
  const { collectionBindings } = useCollectionContext();
  useEffect(() => {
    published.push(collectionBindings);
  }, [collectionBindings]);
  return null;
}

/** The registry as a plain object, from the newest publish. */
const latest = () => Object.fromEntries(published[published.length - 1]);

function renderTree(ui) {
  published = [];
  mockFetch();
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin={false} getAccessToken={async () => "tok"}>
      <Probe />
      {ui}
    </CmsProvider>,
  );
}

const item = (props = {}) => (
  <CollectionItem collection="news" slug="q1" {...props}>
    {(it) => <span>{it ? it.data.title : "…"}</span>}
  </CollectionItem>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("binding ids", () => {
  it("namespaces ids so they can't collide with a content blockPath", () => {
    expect(collectionItemBindingId("news", "q1")).toBe("collection:news:q1");
    expect(collectionRegionBindingId("news")).toContain("collection:news|");
  });

  it("keys a region by its filter window, whatever the key order", () => {
    expect(collectionRegionBindingId("news", { a: 1, b: 2 }))
      .toBe(collectionRegionBindingId("news", { b: 2, a: 1 }));
    expect(collectionRegionBindingId("news", { a: 1 }))
      .not.toBe(collectionRegionBindingId("news", { a: 2 }));
  });
});

describe("item bindings", () => {
  it("registers one entry for a record rendered twice", async () => {
    renderTree(<>{item()}{item()}</>);
    await waitFor(() => expect(Object.keys(latest())).toEqual(["collection:news:q1"]));
  });

  it("keeps the entry while any of them is still mounted", async () => {
    const { rerender } = renderTree(<>{item()}{item()}</>);
    await waitFor(() => expect(Object.keys(latest())).toHaveLength(1));

    rerender(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin={false} getAccessToken={async () => "tok"}>
        <Probe />
        {item()}
      </CmsProvider>,
    );
    expect(Object.keys(latest())).toEqual(["collection:news:q1"]);

    rerender(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin={false} getAccessToken={async () => "tok"}>
        <Probe />
      </CmsProvider>,
    );
    await waitFor(() => expect(Object.keys(latest())).toHaveLength(0));
  });

  it("files the card under the enclosing CmsGroup", async () => {
    renderTree(<CmsGroup name="hero">{item()}</CmsGroup>);
    await waitFor(() => expect(latest()["collection:news:q1"]?.group).toBe("hero"));
  });

  it("keeps the first placement and warns when one record is bound twice differently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderTree(
      <>
        <CmsGroup name="hero">{item()}</CmsGroup>
        <CmsGroup name="sidebar">{item()}</CmsGroup>
      </>,
    );
    await waitFor(() => expect(latest()["collection:news:q1"]).toBeTruthy());
    expect(latest()["collection:news:q1"].group).toBe("hero");
    expect(warn.mock.calls.some(([m]) => String(m).includes("bound more than once"))).toBe(true);
  });
});

describe("region bindings", () => {
  it("collapses two regions on the same filter window into one entry", async () => {
    renderTree(
      <>
        <CollectionRegion collection="news" filter={{ featured: true }}>{() => null}</CollectionRegion>
        <CollectionRegion collection="news" filter={{ featured: true }}>{() => null}</CollectionRegion>
      </>,
    );
    await waitFor(() => expect(Object.keys(latest())).toHaveLength(1));
  });

  it("does not republish the registry when an inline filter object is re-created", async () => {
    const tree = (
      <CollectionRegion collection="news" filter={{ featured: true }}>{() => null}</CollectionRegion>
    );
    const { rerender } = renderTree(tree);
    await waitFor(() => expect(Object.keys(latest())).toHaveLength(1));
    const publishCount = published.length;

    // A fresh literal with the same contents: same window, so the registry must
    // stay put rather than churn every consumer memo behind it.
    rerender(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin={false} getAccessToken={async () => "tok"}>
        <Probe />
        <CollectionRegion collection="news" filter={{ featured: true }}>{() => null}</CollectionRegion>
      </CmsProvider>,
    );
    expect(published).toHaveLength(publishCount);
  });
});
