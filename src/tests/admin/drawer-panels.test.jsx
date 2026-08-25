// @vitest-environment jsdom
/**
 * Custom panels are the drawer's third kind of area, and everything below is a
 * claim the drawer makes about them that a panel's author has to be able to
 * rely on: the rail carries them, the body renders inside a `useCmsPanel()`
 * scope, and switching away does not throw the panel's state on the floor.
 *
 * The mount-once rule is the load-bearing one. A panel is a screen an editor
 * fills in, and it also keeps its rail badge up to date while off screen, so
 * unmounting it on every tab switch would break both at once.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";

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
import { Drawer } from "../../admin/Drawer.jsx";
import { useCmsPanel } from "../../panels/context.js";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");

const BASE = "https://api.test";
const CONFIG = createCmsConfig({ baseUrl: BASE });

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Every request as [method, url, init]. */
let requests;

function mockFetch() {
  requests = [];
  global.fetch = vi.fn(async (input, init) => {
    const url = String(input);
    requests.push([init?.method ?? "GET", url, init]);
    if (url.includes("/admin/orders")) return jsonRes([{ id: 1 }, { id: 2 }, { id: 3 }]);
    return jsonRes({ slug: "/", blocks: [] });
  });
}

/** A shut panel is `aria-hidden`, which hides the rail from role queries. */
function OpenDrawer() {
  const { setDrawerOpen } = useCmsContext();
  React.useEffect(() => { setDrawerOpen(true); }, [setDrawerOpen]);
  return null;
}

/** Counts mounts across remounts of the tree, for the mount-once claim. */
let mountCount;

function OrdersPanel() {
  const { request, setBadge, t: panelT } = useCmsPanel();
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => { mountCount += 1; }, []);
  React.useEffect(() => {
    request("/admin/orders").then((r) => { setRows(r); setBadge(r.length); });
  }, [request, setBadge]);
  return (
    <div>
      <span data-testid="orders-body">{rows ? `${rows.length} orders` : "loading"}</span>
      <span data-testid="orders-t">{panelT("drawer.page")}</span>
    </div>
  );
}

const ORDERS = { id: "orders", label: "Orders", Component: OrdersPanel };

function renderDrawer(panels) {
  return render(
    <CmsProvider panels={panels} config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
      <OpenDrawer />
      <Drawer panels={panels ?? null} />
    </CmsProvider>,
  );
}

const click = (el) => act(() => { el.click(); });

// jsdom gaps the tab bar walks into while measuring and scrolling the active
// tab. All three exist in every browser, so they are shimmed here rather than
// guarded in the drawer.
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

describe("custom panels in the drawer", () => {
  it("adds no rail button when the app registered none", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer(undefined);

    expect(await screen.findByRole("button", { name: t("drawer.page") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Orders" })).toBeNull();
  });

  it("carries a registered panel on the rail and opens its body", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([ORDERS]);

    const rail = await screen.findByRole("button", { name: "Orders" });
    // Registered is not mounted: the body only exists once the area is opened,
    // so a panel costs nothing until someone goes looking for it.
    expect(screen.queryByTestId("orders-body")).toBeNull();

    click(rail);
    expect(await screen.findByTestId("orders-body")).toBeTruthy();
  });

  it("puts the panel's name in the header path", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    const path = screen.getByLabelText(t("drawer.location"));
    await waitFor(() => expect(path.textContent).toContain("Orders"));
  });

  it("resolves labelKey through adminStrings, and prints a plain label as written", async () => {
    mockFetch();
    mountCount = 0;
    render(
      <CmsProvider
        config={createCmsConfig({
          baseUrl: BASE,
          adminStrings: { "panels.orders": "Siparişler" },
        })}
        isAdmin
        getAccessToken={async () => "tok"}
      >
        <OpenDrawer />
        <Drawer panels={[{ id: "orders", labelKey: "panels.orders", Component: OrdersPanel }]} />
      </CmsProvider>,
    );

    expect(await screen.findByRole("button", { name: "Siparişler" })).toBeTruthy();
  });

  it("reaches the backend through the transport, with the editor's bearer", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    await screen.findByText("3 orders");

    const call = requests.find(([, url]) => url.includes("/admin/orders"));
    // `baseUrl` root, not the `/cms` prefix the CMS endpoints carry.
    expect(call[1]).toBe(`${BASE}/admin/orders`);
    expect(call[2].headers.Authorization).toBe("Bearer tok");
  });

  it("takes an absolute URL when it is the backend, so a full URL stays writable", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([{
      id: "abs",
      label: "Absolute",
      Component: () => {
        const { request } = useCmsPanel();
        React.useEffect(() => { request(`${BASE}/admin/orders`); }, [request]);
        return <span data-testid="abs">sent</span>;
      },
    }]);

    click(await screen.findByRole("button", { name: "Absolute" }));
    await waitFor(() => expect(requests.some(([, url]) => url.includes("/admin/orders"))).toBe(true));
    const call = requests.find(([, url]) => url.includes("/admin/orders"));
    expect(call[2].headers.Authorization).toBe("Bearer tok");
  });

  it("refuses another host outright rather than quietly dropping the credential", async () => {
    // The credential rides on every call this makes, so what keeps it from
    // travelling is that there is nowhere else to send it. A silent
    // unauthenticated call would come back as a puzzling 401 instead.
    mockFetch();
    mountCount = 0;
    function OutboundPanel() {
      const { request } = useCmsPanel();
      const [err, setErr] = React.useState(null);
      React.useEffect(() => {
        request("https://elsewhere.test/webhook", { method: "POST" })
          .catch((e) => setErr(e.message));
      }, [request]);
      return <span data-testid="outbound">{err ?? "…"}</span>;
    }
    renderDrawer([{ id: "out", label: "Outbound", Component: OutboundPanel }]);

    click(await screen.findByRole("button", { name: "Outbound" }));
    // Names the tool that does reach a third party, since that is the fix.
    await waitFor(() =>
      expect(screen.getByTestId("outbound").textContent).toMatch(/fetch\(\)/));
    expect(requests.some(([, url]) => url.includes("elsewhere.test"))).toBe(false);
  });

  it("hands the panel the drawer's own translator", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    expect((await screen.findByTestId("orders-t")).textContent).toBe(t("drawer.page"));
  });

  it("keeps the panel mounted while another area is on screen", async () => {
    mockFetch();
    mountCount = 0;
    renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    await screen.findByText("3 orders");
    expect(mountCount).toBe(1);

    click(screen.getByRole("button", { name: t("drawer.page") }));
    click(screen.getByRole("button", { name: "Orders" }));

    // Same instance throughout: no second mount, and the loaded rows survived.
    await screen.findByText("3 orders");
    expect(mountCount).toBe(1);
  });

  it("shows the count a panel sets on its rail icon", async () => {
    mockFetch();
    mountCount = 0;
    const { container } = renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    await screen.findByText("3 orders");

    const rail = screen.getByRole("button", { name: "Orders" });
    await waitFor(() => expect(rail.textContent).toContain("3"));

    // And it stays put once the user leaves: that is the whole point of a mark
    // on an area you are not currently looking at.
    click(screen.getByRole("button", { name: t("drawer.page") }));
    expect(container.querySelector('[aria-label="Orders"]').textContent).toContain("3");
  });

  it("falls back to the page area when the active panel is withdrawn", async () => {
    mockFetch();
    mountCount = 0;
    const { rerender } = renderDrawer([ORDERS]);

    click(await screen.findByRole("button", { name: "Orders" }));
    await screen.findByTestId("orders-body");

    await act(async () => {
      rerender(
        <CmsProvider config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
          <OpenDrawer />
          <Drawer panels={null} />
        </CmsProvider>,
      );
    });

    expect(screen.queryByTestId("orders-body")).toBeNull();
    expect(screen.getByRole("button", { name: t("drawer.page") })).toBeTruthy();
  });
});

describe("useCmsPanel outside a panel", () => {
  it("names what it needs instead of returning an empty API", () => {
    const Stray = () => {
      useCmsPanel();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Stray />)).toThrow(/must be called inside a panel/);
    spy.mockRestore();
  });
});
