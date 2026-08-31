// @vitest-environment jsdom
/**
 * What the drawer spends its height on.
 *
 * The panel is 460px wide and had five horizontal bands standing in it at all
 * times: header, tab strip, toolbar, status bar, footer. Two of them were
 * permanent for content read once a session (a name and an address) or for
 * saying nothing was happening. Both are gone as bands: the account folded
 * behind the header's avatar, and the status bar now arrives only when it has
 * something to say.
 *
 * The header keeps its status pill, and the two of them stopped repeating each
 * other: the pill is state (what is happening to the work), the bar is action
 * (what is pending and the buttons that settle it). They used to both say
 * "publishing" during a publish, which is the moment either is being read.
 *
 * The split is deliberately this way round. State is the thing an editor most
 * wants to know and should never go looking for, so it lives in the row that is
 * always on screen; actions come and go with the work that needs them.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

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
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";
import { statusBarStyle } from "../../admin/drawer-styles.js";
import { COMPACT_QUERY } from "../../shared/style/tokens.js";

const t = createTranslator(resolveStrings("en"), "en");
const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });
const USER = { name: "Fatih Naz", email: "fatih@example.com", image: null };

const jsonRes = (body) => new Response(JSON.stringify(body), { status: 200 });

function mockFetch(blocks = []) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    if (url.includes("__global")) return jsonRes({ slug: "__global", blocks: [] });
    return jsonRes({ slug: "/", blocks });
  });
}

function SetOpen() {
  const { setDrawerOpen } = useCmsContext();
  React.useEffect(() => { setDrawerOpen(true); }, [setDrawerOpen]);
  return null;
}

function renderDrawer({ userInfo = USER, blocks = [] } = {}) {
  mockFetch(blocks);
  return render(
    <CmsProvider
      config={CONFIG}
      isAdmin
      getAccessToken={async () => "tok"}
      userInfo={userInfo}
      onSignOut={() => {}}
    >
      <SetOpen />
      <Drawer />
    </CmsProvider>,
  );
}

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

/**
 * Answers one query true and everything else false, which is how the drawer
 * decides whether the rail is lying down.
 *
 * @param {string} match
 */
function matchOnly(match) {
  window.matchMedia = vi.fn((query) => ({
    matches: query === match,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  // @ts-expect-error putting the environment back as it was found
  delete window.matchMedia;
  vi.restoreAllMocks();
});

const pill = () => document.querySelector(".inscribed-header-pill");

const footer = () => document.querySelector("aside footer");
const signOut = () => screen.queryByRole("button", { name: t("drawer.signOut") });

describe("the account", () => {
  it("stands at the foot of the panel, where it has always been", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());

    expect(footer()?.textContent).toContain(USER.name);
    expect(footer()?.textContent).toContain(USER.email);
    expect(signOut()).toBeTruthy();
  });

  // Two letters where there is no picture.
  it("falls back to initials without an avatar image", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(footer()?.textContent).toContain("FN");
  });

  it("shows nothing at all when nobody is signed in", async () => {
    renderDrawer({ userInfo: null });
    await waitFor(() => expect(document.querySelector("aside")).toBeTruthy());
    expect(footer()).toBeNull();
  });
});

describe("the status bar", () => {
  // The absence of a bar already says there is nothing to do; holding 36px to
  // say it in words is the same statement twice, in the scarcest space here.
  it("stays away while there is nothing to act on", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(screen.queryByRole("button", { name: t("drawer.saveAll") })).toBeNull();
  });

  // It is the actions and their subject, not a second narration of the wire.
  it("narrates nothing the pill already says", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());

    const body = document.querySelector("aside")?.textContent ?? "";
    // Said once at most, and by the pill.
    expect(body.split(t("status.publishing")).length - 1).toBeLessThanOrEqual(1);
  });

  // A live region that unmounts cannot announce, and the transitions worth
  // announcing are exactly the ones that take the bar away again.
  it("keeps its live region mounted even with the bar gone", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(document.querySelector('[role="status"]')).toBeTruthy();
  });
});

describe("the header", () => {
  // The most important thing an editor can be told is that their work is safe,
  // and it is worthless if they have to go looking for it. It stays in the row
  // that is on screen whatever else is.
  it("keeps the autosave state on screen", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(document.querySelector("header .inscribed-header-pill")).toBeTruthy();
  });



  it("still says where you are", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(document.querySelector('nav[aria-label]')).toBeTruthy();
  });
});

describe("where the status pill sits", () => {
  it("is in the header while the panel is a full side column", async () => {
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(document.querySelector("header .inscribed-header-pill")).toBeTruthy();
  });

  // Below the wide shell the panel is 360px and the rail is lying down with
  // width to spare. The breadcrumb needs that width more than the pill does.
  it("hangs off the rail once the rail lies down", async () => {
    matchOnly(COMPACT_QUERY);
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());

    expect(pill()).toBeTruthy();
    expect(document.querySelector("header .inscribed-header-pill")).toBeNull();
    expect(pill()?.closest(".inscribed-rail-tail")).toBeTruthy();
  });

  // One pill, handed between rows. Two that took turns would each carry their
  // own animation state and cross-fade against each other on a resize.
  it("is never in both rows at once", async () => {
    matchOnly(COMPACT_QUERY);
    renderDrawer();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(document.querySelectorAll(".inscribed-header-pill").length).toBe(1);
  });
});

describe("the status bar's build", () => {
  // Fixed rather than content-driven: the button row is taller than the status
  // line, so a content-driven box jumped on every toggle between them.
  it("holds one height whatever it is showing", () => {
    expect(statusBarStyle.minHeight).toBe(36);
    expect(statusBarStyle.alignItems).toBe("center");
  });

  // Sized to the controls plus a hair of breathing room: the bar stops padding
  // around them rather than setting their size.
  it("clears the controls it holds without dwarfing them", () => {
    expect(statusBarStyle.minHeight).toBeGreaterThan(26);
    expect(statusBarStyle.minHeight).toBeLessThan(44);
  });
});
