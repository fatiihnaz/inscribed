// @vitest-environment jsdom
/**
 * The drawer comes back the way it was left: after a remount, which a language
 * switch under `app/[locale]/` causes, and after a reload.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { Drawer } from "../../admin/Drawer.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";
import { drawerSnapshotKey, writeDrawerSnapshot } from "../../shared/state/drawer-snapshot.js";

const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });
const USER = { name: "Fatih Naz", email: "fatih@example.com", image: null };
const SITE = {
  pages: [{
    slug: "/",
    blocks: [{ blockPath: "hero.title", blockType: "ShortText", value: "Merhaba", draftValue: null, version: 1, sortOrder: 1 }],
  }],
  global: [],
};

/** Whether the drawer was open on the provider's first render, before any effect. */
let openOnFirstRender = /** @type {boolean | null} */ (null);

function makeProbe(useContext = useCmsContext) {
  return function Probe() {
    const { uiStore } = useContext();
    openOnFirstRender ??= uiStore.get().isDrawerOpen;
    return null;
  };
}

async function mount({ Provider = CmsProvider, DrawerComponent = Drawer, Probe = makeProbe() } = {}) {
  openOnFirstRender = null;
  await act(async () => {
    render(
      <Provider
        config={CONFIG}
        isAdmin
        getAccessToken={async () => "tok"}
        userInfo={USER}
        onSignOut={() => {}}
        initialSite={SITE}
      >
        <Probe />
        <DrawerComponent />
      </Provider>,
    );
  });
}

const handle = () => screen.getByRole("button", { name: /the panel$/ });
const search = () => /** @type {HTMLInputElement} */ (screen.getByPlaceholderText("Search blocks (path or type)"));

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

afterEach(() => {
  cleanup();
});

describe("the drawer's state", () => {
  it("is back on the first render after a remount", async () => {
    await mount();
    fireEvent.click(handle());
    fireEvent.change(search(), { target: { value: "hero" } });
    cleanup();

    await mount();
    expect(openOnFirstRender).toBe(true);
    expect(search().value).toBe("hero");
  });

  it("starts fresh after signing out", async () => {
    await mount();
    fireEvent.click(handle());
    fireEvent.change(search(), { target: { value: "hero" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    cleanup();

    await mount();
    expect(handle().getAttribute("aria-label")).toBe("Open the panel");
    expect(search().value).toBe("");
  });

  it("opens after the first render of a page load, which has to match the server's", async () => {
    vi.resetModules();
    const { CmsProvider: Provider } = await import("../../core/CmsProvider.jsx");
    const { Drawer: DrawerComponent } = await import("../../admin/Drawer.jsx");
    const { useCmsContext: useFreshContext } = await import("../../shared/state/cms-context.js");
    writeDrawerSnapshot(drawerSnapshotKey(CONFIG), /** @type {*} */ ({ open: true, search: "hero" }));

    await mount({ Provider, DrawerComponent, Probe: makeProbe(useFreshContext) });
    expect(openOnFirstRender).toBe(false);
    expect(handle().getAttribute("aria-label")).toBe("Close the panel");
    expect(search().value).toBe("hero");
  });
});
