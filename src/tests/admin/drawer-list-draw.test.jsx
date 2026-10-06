// @vitest-environment jsdom
/**
 * When the drawer draws a page's cards: never inside the navigation itself, at
 * once while it is open, and when the browser is idle while it is shut.
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { Drawer } from "../../admin/Drawer.jsx";
import { createCmsConfig } from "../../shared/config.js";

const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });
const block = (blockPath, value) => ({ blockPath, blockType: "ShortText", value, draftValue: null, version: 1, sortOrder: 1 });
const SITE = {
  pages: [
    { slug: "/", blocks: [block("hero.title", "Merhaba")] },
    { slug: "/about", blocks: [block("about.body", "Hakkında")] },
  ],
  global: [],
};

/** @type {Array<() => void>} */
let idle = [];

const tree = () => (
  <CmsProvider config={CONFIG} isAdmin getAccessToken={async () => "tok"} initialSite={SITE}>
    <Drawer />
  </CmsProvider>
);

async function mount() {
  let view;
  await act(async () => {
    view = render(tree());
  });
  return /** @type {ReturnType<typeof render>} */ (view);
}

const list = () => document.querySelector("[data-cms-list]");
const runIdle = () => act(async () => {
  const queued = idle;
  idle = [];
  for (const cb of queued) cb();
});

beforeAll(() => {
  if (typeof globalThis.CSS === "undefined") {
    globalThis.CSS = /** @type {*} */ ({ escape: (s) => String(s).replace(/["\\]/g, "\\$&") });
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = /** @type {*} */ (class { observe() {} unobserve() {} disconnect() {} });
  }
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);
    return new Response(url.includes("/cms/collections/me") ? "[]" : JSON.stringify(SITE));
  });
});

beforeEach(() => {
  idle = [];
  window.requestIdleCallback = /** @type {*} */ ((cb) => idle.push(cb));
  window.cancelIdleCallback = () => {};
});

afterEach(() => {
  cleanup();
  nav.pathname = "/";
});

describe("the drawer's card list", () => {
  it("waits for an idle moment while the drawer is shut", async () => {
    await mount();
    expect(list()).toBeNull();

    await runIdle();
    expect(list()?.textContent).toContain("hero");
  });

  it("is drawn at once when a shut drawer opens before that moment", async () => {
    await mount();
    expect(list()).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /the panel$/ }));
    });
    expect(list()?.textContent).toContain("hero");
  });

  it("follows a navigation with the new page's cards", async () => {
    const view = await mount();
    await runIdle();

    nav.pathname = "/about";
    await act(async () => {
      view.rerender(tree());
    });
    // Shut, so the new page's cards wait for idle too, and the old ones are gone.
    expect(list()).toBeNull();

    await runIdle();
    expect(list()?.textContent).toContain("about");
  });
});
