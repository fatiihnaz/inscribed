// @vitest-environment jsdom
/**
 * Collections are opt-in: an app that doesn't pass `collections` to
 * `<CmsProvider>` never mounts `<CollectionProvider>`, so the drawer is the one
 * admin surface that has to render either way.
 *
 * Two things are guarded here, both of them things the old always-mounted
 * provider got wrong. The drawer must not throw for the missing context, and it
 * must not offer a Collections rail button that opens an area the app doesn't
 * have. And with no provider there is nobody to call `/cms/collections/me`, so
 * an admin session on a collection-less site costs no round-trip.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { Drawer } from "../../admin/Drawer.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");

const BASE = "https://api.test";
const CONFIG = createCmsConfig({ baseUrl: BASE });

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Every request as [method, url]. */
let requests;

function mockFetch() {
  requests = [];
  global.fetch = vi.fn(async (input, init) => {
    const url = String(input);
    requests.push([init?.method ?? "GET", url]);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    return jsonRes({ slug: "/", blocks: [] });
  });
}

/** A shut panel is `aria-hidden`, which hides the rail from role queries. */
function OpenDrawer() {
  const { setDrawerOpen } = useCmsContext();
  React.useEffect(() => { setDrawerOpen(true); }, [setDrawerOpen]);
  return null;
}

/** The drawer mounted directly: `next/dynamic` is a Noop here, so going
 *  through `<CmsProvider>`'s own lazy `AdminDrawer` would render nothing. */
function renderDrawer(collections) {
  return render(
    <CmsProvider collections={collections} config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
      <OpenDrawer />
      <Drawer />
    </CmsProvider>,
  );
}

const meRequests = () => requests.filter(([, url]) => url.includes("/cms/collections/me"));

// jsdom gaps the tab bar walks into while measuring and scrolling the active
// tab. All three exist in every browser, so they are shimmed here rather than
// guarded in the drawer. Tab ids are plain slugs; quoting them is enough.
beforeAll(() => {
  if (typeof globalThis.CSS === "undefined") {
    globalThis.CSS = /** @type {*} */ ({ escape: (s) => String(s).replace(/["\\]/g, "\\$&") });
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = /** @type {*} */ (
      class { observe() {} unobserve() {} disconnect() {} }
    );
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the drawer without a collections provider", () => {
  it("renders, and offers the page rail only", async () => {
    mockFetch();
    renderDrawer(undefined);

    expect(await screen.findByRole("button", { name: t("drawer.page") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("drawer.collections") })).toBeNull();
  });

  it("asks nobody for /me, since there is no collection to describe", async () => {
    mockFetch();
    renderDrawer(undefined);

    await screen.findByRole("button", { name: t("drawer.page") });
    // The page fetch settling is what makes the absence below meaningful: it
    // shows requests did flow, and none of them was /me.
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(meRequests()).toEqual([]);
  });

  it("offers the collections rail once the app opts in", async () => {
    mockFetch();
    renderDrawer(CollectionProvider);

    expect(await screen.findByRole("button", { name: t("drawer.collections") })).toBeTruthy();
    await waitFor(() => expect(meRequests().length).toBe(1));
  });

  it("keeps the rail once the user can reach no collection, so the area doesn't vanish", async () => {
    // `/me` comes back empty (permissions, or nothing created yet). The app did
    // opt in, so the section stays and explains itself inside.
    mockFetch();
    renderDrawer(CollectionProvider);

    await waitFor(() => expect(meRequests().length).toBe(1));
    expect(screen.getByRole("button", { name: t("drawer.collections") })).toBeTruthy();
  });
});
