// @vitest-environment jsdom
/**
 * Moving around the drawer: a panel going deeper into itself, and a link
 * arriving from outside.
 *
 * `<PanelStack>` rests on the claim that a panel's view stack and the drawer's
 * header path are the same fact, so what is checked is that pushing a view
 * grows a crumb and that clicking one asks the panel to come back out rather
 * than popping the view behind its back.
 *
 * The shareable links are checked for what makes them shareable: the recipient
 * arrives cold, so the thing being opened is often not there yet. A block link
 * has to wait for the route's content, land when it turns up, and give up
 * rather than fire on some later page if it never does.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor, within, act } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));

// A pathname the test can move: the test plays the arrival itself, so it also
// controls when the new route's blocks land, which is the timing a cold link
// has to survive.
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { CollectionProvider } from "../../collections/CollectionProvider.jsx";
import { Drawer } from "../../admin/Drawer.jsx";
import { useCmsPanel } from "../../panels/context.js";
import { PanelStack } from "../../panels/PanelStack.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");

const BASE = "https://api.test";
const CONFIG = createCmsConfig({ baseUrl: BASE });

/** @param {string} blockPath */
const block = (blockPath) => ({
  blockPath, blockType: "ShortText", value: "x", version: 1, sortOrder: 1,
});

function OpenDrawer() {
  const { setDrawerOpen } = useCmsContext();
  React.useEffect(() => { setDrawerOpen(true); }, [setDrawerOpen]);
  return null;
}

/**
 * The block selection as state rather than as rendered chrome: what a link
 * promises is which block ends up selected and when, and reading that off the
 * store says so directly. `active|pending`.
 */
function UiProbe() {
  const { uiStore } = useCmsContext();
  const active = useStoreSelector(uiStore, (s) => s.activeBlock);
  const pending = useStoreSelector(uiStore, (s) => s.pendingBlock);
  return <span data-testid="ui">{`${active ?? "-"}|${pending ?? "-"}`}</span>;
}

const ui = () => screen.getByTestId("ui").textContent;
const headerPath = () => screen.getByLabelText(t("drawer.location"));

function tree(panels, initialBlocks) {
  return (
    <CmsProvider
      panels={panels} config={CONFIG} isAdmin
      initialBlocks={initialBlocks} getAccessToken={async () => "tok"}
    >
      <OpenDrawer />
      <UiProbe />
      <Drawer panels={panels} />
    </CmsProvider>
  );
}

const click = (el) => act(() => { el.click(); });

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
  pathname = "/";
  window.history.replaceState(null, "", "/");
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

// ---------------------------------------------------------------------------
// <PanelStack>
// ---------------------------------------------------------------------------

/** Records what depth the panel was asked to return to. */
let backTo;

function StackPanel() {
  const [open, setOpen] = React.useState(null);
  backTo = backTo ?? [];
  return (
    <PanelStack
      onBack={(i) => { backTo.push(i); setOpen(null); }}
      views={[
        {
          key: "list",
          label: "Orders",
          node: (
            <button type="button" onClick={() => setOpen(1234)}>row 1234</button>
          ),
        },
        open && { key: `order-${open}`, label: `#${open}`, node: <span>detail {open}</span> },
      ]}
    />
  );
}

const STACK = [{ id: "orders", label: "Orders", Component: StackPanel }];

describe("<PanelStack>", () => {
  it("grows the header path as views are pushed, and shrinks it back", async () => {
    backTo = [];
    render(tree(STACK, []));
    click(await screen.findByRole("button", { name: "Orders" }));

    // One view: the panel's own name is the whole path.
    await waitFor(() => expect(headerPath().textContent).toContain("Orders"));
    expect(headerPath().textContent).not.toContain("#1234");

    click(screen.getByRole("button", { name: "row 1234" }));
    await waitFor(() => expect(headerPath().textContent).toContain("#1234"));
    expect(screen.getByText("detail 1234")).toBeTruthy();
  });

  it("asks the panel to come back out rather than popping the view itself", async () => {
    backTo = [];
    render(tree(STACK, []));
    click(await screen.findByRole("button", { name: "Orders" }));
    click(screen.getByRole("button", { name: "row 1234" }));
    await waitFor(() => expect(headerPath().textContent).toContain("#1234"));

    // Scoped to the header: the rail button carries this label too.
    click(within(headerPath()).getByRole("button", { name: "Orders" }));

    expect(backTo).toEqual([0]);
    await waitFor(() => expect(headerPath().textContent).not.toContain("#1234"));
  });

  it("skips a falsy view, so a conditional one can be written inline", async () => {
    backTo = [];
    render(tree(STACK, []));
    click(await screen.findByRole("button", { name: "Orders" }));

    // `open` is null, so the second entry is `null` and produces no crumb.
    await waitFor(() => expect(headerPath().textContent).toContain("Orders"));
    expect(headerPath().textContent).not.toContain("#");
  });

  it("keeps the trail while another area is on screen, since the panel stays mounted", async () => {
    backTo = [];
    render(tree(STACK, []));
    click(await screen.findByRole("button", { name: "Orders" }));
    click(screen.getByRole("button", { name: "row 1234" }));
    await waitFor(() => expect(headerPath().textContent).toContain("#1234"));

    click(screen.getByRole("button", { name: t("drawer.page") }));
    await waitFor(() => expect(headerPath().textContent).not.toContain("#1234"));

    click(screen.getByRole("button", { name: "Orders" }));
    await waitFor(() => expect(headerPath().textContent).toContain("#1234"));
  });
});

// ---------------------------------------------------------------------------
// isActive
// ---------------------------------------------------------------------------

describe("isActive", () => {
  it("tells a panel when it is off screen, which mounted-but-hidden hides", async () => {
    function WatchPanel() {
      const { isActive } = useCmsPanel();
      return <span data-testid="watch">{isActive ? "on" : "off"}</span>;
    }
    render(tree([{ id: "watch", label: "Watch", Component: WatchPanel }], []));

    click(await screen.findByRole("button", { name: "Watch" }));
    expect(screen.getByTestId("watch").textContent).toBe("on");

    // Still mounted (that is the whole design), but no longer the area on
    // screen, so a panel that polls can stand its work down here.
    click(screen.getByRole("button", { name: t("drawer.page") }));
    await waitFor(() => expect(screen.getByTestId("watch").textContent).toBe("off"));

    click(screen.getByRole("button", { name: "Watch" }));
    await waitFor(() => expect(screen.getByTestId("watch").textContent).toBe("on"));
  });
});


// ---------------------------------------------------------------------------
// Shareable links
// ---------------------------------------------------------------------------

/** @param {string} search */
const land = (search) => window.history.replaceState(null, "", `/${search}`);

function PlainPanel() {
  return <span data-testid="plain">panel body</span>;
}
const PLAIN = [{ id: "orders", label: "Orders", Component: PlainPanel }];

describe("links into the admin surface", () => {
  it("opens the panel a link names, and clears only its own marker", async () => {
    land("?cms-panel=orders&keep=1");
    render(tree(PLAIN, []));

    // The body only exists once the area is open, so finding it is the
    // assertion: the link, not a click, is what opened it.
    expect(await screen.findByTestId("plain")).toBeTruthy();
    expect(window.location.search).toBe("?keep=1");
  });

  it("ignores a panel nobody registered, and still clears the marker", async () => {
    land("?cms-panel=nope");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(tree(PLAIN, []));

    await screen.findByRole("button", { name: "Orders" });
    expect(screen.queryByTestId("plain")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cms-panel=nope"));
    expect(window.location.search).toBe("");
  });

  it("selects the block a link names", async () => {
    land("?cms-block=hero.title");
    render(tree(PLAIN, [block("hero.title")]));

    await waitFor(() => expect(ui()).toBe("hero.title|-"));
  });

  it("waits for a block whose route is still settling", async () => {
    // The link landed before the block did, which is the ordinary case for
    // someone opening a shared URL cold.
    land("?cms-block=hero.title");
    const { rerender } = render(tree(PLAIN, []));
    await waitFor(() => expect(ui()).toBe("-|hero.title"));

    await act(async () => { rerender(tree(PLAIN, [block("hero.title")])); });
    await waitFor(() => expect(ui()).toBe("hero.title|-"));
  });

  it("gives up on a block once it has landed somewhere without it", async () => {
    land("?cms-block=hero.title");
    const { rerender } = render(tree(PLAIN, []));
    await waitFor(() => expect(ui()).toBe("-|hero.title"));

    await act(async () => {
      pathname = "/news";
      rerender(tree(PLAIN, [block("news.headline")]));
    });

    // Dropped rather than left armed to fire on some later page.
    await waitFor(() => expect(ui()).toBe("-|-"));
  });

  it("says so when a collection link arrives at an app without collections", async () => {
    land("?cms-collection=news");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(tree(PLAIN, []));

    await screen.findByRole("button", { name: "Orders" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("collections provider"));
    expect(window.location.search).toBe("");
  });
});

describe("a collection link, on an app that opted in", () => {
  it("opens the collections area on the collection it names", async () => {
    land("?cms-collection=news");
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/cms/collections/me")) {
        return new Response(JSON.stringify([
          { collectionKey: "news", schema: { fields: [] }, locales: [], canCreate: true },
        ]));
      }
      return new Response(JSON.stringify({ slug: "/", blocks: [] }));
    });

    render(
      <CmsProvider
        panels={PLAIN} collections={CollectionProvider} config={CONFIG} isAdmin
        initialBlocks={[]} getAccessToken={async () => "tok"}
      >
        <OpenDrawer />
        <UiProbe />
        <Drawer panels={PLAIN} />
      </CmsProvider>,
    );

    // The header path is where the area announces itself: `collections / news`.
    await waitFor(() => expect(headerPath().textContent).toContain("news"));
    expect(window.location.search).toBe("");
  });
});
