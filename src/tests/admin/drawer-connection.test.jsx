// @vitest-environment jsdom
/**
 * The drawer while the session behind it is still resolving: shown the way it
 * was left, saying so, and taking no input until the backend answers.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

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
import { useCmsContext } from "../../shared/state/cms-context.js";
import { Drawer } from "../../admin/Drawer.jsx";
import { createCmsConfig } from "../../shared/config.js";
import { DRAWER_BODY_CLASS } from "../../admin/drawer-styles.js";

const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });

/** @param {{ connection: "connecting" | "offline" }} props */
function renderDrawer(props) {
  return render(
    <CmsProvider config={CONFIG}>
      <Drawer {...props} />
    </CmsProvider>,
  );
}

const body = () => document.querySelector(`.${DRAWER_BODY_CLASS}`);

beforeAll(() => {
  if (typeof globalThis.CSS === "undefined") {
    globalThis.CSS = /** @type {*} */ ({ escape: (s) => String(s).replace(/["\\]/g, "\\$&") });
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = /** @type {*} */ (class { observe() {} unobserve() {} disconnect() {} });
  }
  globalThis.fetch = vi.fn(async () => new Response("[]"));
});

afterEach(() => {
  cleanup();
});

describe("a drawer whose session is still resolving", () => {
  it("says it is connecting and takes no input", () => {
    renderDrawer({ connection: "connecting" });
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(body()?.hasAttribute("inert")).toBe(true);
  });

  it("reads no other language before the session is back", async () => {
    function OpenDrawer() {
      const { setDrawerOpen } = useCmsContext();
      React.useEffect(() => { setDrawerOpen(true); }, [setDrawerOpen]);
      return null;
    }
    await act(async () => {
      render(
        <CmsProvider config={createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"] })}>
          <OpenDrawer />
          <Drawer connection="connecting" />
        </CmsProvider>,
      );
    });

    const reads = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes("/content/all"));
    expect(reads).toEqual([]);
  });

  it("says the connection is lost while it retries", () => {
    renderDrawer({ connection: "offline" });
    expect(screen.getByText("Connection lost, retrying…")).toBeTruthy();
  });
});
