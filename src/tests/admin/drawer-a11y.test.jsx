// @vitest-environment jsdom
/**
 * The keyboard contract of the drawer shell.
 *
 * A closed drawer is still in the DOM, translated off-screen, so without
 * `inert` every control inside it stays tabbable: an editor tabbing through
 * the host page walks into a panel they cannot see. And the tab strip carries
 * `role="tablist"`, which promises arrow-key navigation and a panel each tab
 * points at.
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
import { BlockCard } from "../../admin/BlockCard.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

const t = createTranslator(resolveStrings("en"), "en");
const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * The drawer fetches the page slug and the global slug separately and stamps
 * `_slug` from whichever response a block arrived in, so a global block has to
 * come back from the global request rather than be labelled one up front.
 *
 * @param {{ page?: *[], global?: *[] }} [scopes]
 */
function mockFetch({ page = [], global: globals = [] } = {}) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    if (url.includes("__global")) return jsonRes({ slug: "__global", blocks: globals });
    return jsonRes({ slug: "/", blocks: page });
  });
}

function SetOpen({ open }) {
  const { setDrawerOpen } = useCmsContext();
  React.useEffect(() => { setDrawerOpen(open); }, [setDrawerOpen, open]);
  return null;
}

function renderDrawer({ open = true, scopes } = {}) {
  mockFetch(scopes);
  return render(
    <CmsProvider config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
      <SetOpen open={open} />
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The panel column, i.e. everything but the reopen handle. */
const body = () => document.querySelector("aside > div");

/** @param {string} blockPath @param {number} sortOrder */
const shortText = (blockPath, sortOrder) => ({
  blockPath,
  blockType: "ShortText",
  value: "",
  draftValue: null,
  version: 1,
  sortOrder,
});

// One block in each scope, which is what makes the strip grow a second tab.
const SCOPES = {
  page: [shortText("hero.title", 1)],
  global: [shortText("footer.note", 2)],
};

// Both cases mount the whole drawer, so they are deliberately few and fat: the
// suite already carries timing-sensitive animation tests that a heavier
// parallel run makes flaky.
describe("the drawer shell", () => {
  it("goes inert when closed, keeping only the handle that reopens it", async () => {
    renderDrawer({ open: false });
    const handle = await screen.findByRole("button", { name: t("drawer.openPanel") });
    expect(body().hasAttribute("inert")).toBe(true);
    expect(body().contains(handle)).toBe(false);
  });

  it("offers a real tablist: one tab stop, arrow keys, a panel per tab", async () => {
    renderDrawer({ scopes: SCOPES });
    const page = await screen.findByRole("tab", { name: /page/i });
    const global = await screen.findByRole("tab", { name: /global/i });

    expect(body().hasAttribute("inert")).toBe(false);

    const panelId = page.getAttribute("aria-controls");
    expect(document.getElementById(panelId)?.getAttribute("role")).toBe("tabpanel");

    // Roving: Tab reaches the strip once, the arrows move inside it.
    expect(page.getAttribute("tabindex")).toBe("0");
    expect(global.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(page, { key: "ArrowRight" });
    await waitFor(() => expect(global.getAttribute("aria-selected")).toBe("true"));
  });
});

/**
 * A heavy card keeps its editor mounted while shut (`height: 0`), which leaves
 * the editor's own controls in the tab order behind a card that shows nothing.
 * Cheap on purpose: the card alone, not the drawer around it.
 */
describe("a collapsed block card", () => {
  const imageBlock = {
    blockPath: "hero.image",
    blockType: "Image",
    value: { src: "", alt: "" },
    draftValue: null,
    version: 1,
    sortOrder: 1,
    _slug: "/",
  };

  const collapseBody = () => document.querySelector(".inscribed-collapse");

  it("takes its editor out of the tab order until it is opened", async () => {
    mockFetch();
    render(
      <CmsProvider config={CONFIG} isAdmin initialBlocks={[imageBlock]}>
        <BlockCard block={imageBlock} displayPath="hero.image" topLevel isActive={false} itemSchema={null} />
      </CmsProvider>,
    );

    await waitFor(() => expect(collapseBody()).toBeTruthy());
    expect(collapseBody().hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await waitFor(() => expect(collapseBody().hasAttribute("inert")).toBe(false));
  });
});
