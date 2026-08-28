// @vitest-environment jsdom
/**
 * @file `<EditableRegion>` with a function child: the caller renders, the region
 * still declares and wraps.
 *
 * This is the only way the types that draw nothing (Number, Bool, StringArray)
 * reach a page at all, so the assertions are about what the visitor gets, what
 * the admin gets on top, and what the mode costs.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { EditableRegion } from "../../core/EditableRegion.jsx";
import { CmsGroup } from "../../core/CmsGroup.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";

const BASE = "https://api.test";

/** @param {string} blockPath @param {string} blockType @param {*} value */
const mk = (blockPath, blockType, value) => ({
  blockPath, blockType, value, draftValue: null, version: 1, sortOrder: 1, _slug: "/",
});

const BLOCKS = [
  mk("stats.count", "Number", 42),
  mk("hero.count", "Number", 7),
  mk("post.title", "ShortText", "Merhaba"),
];

function ActiveProbe() {
  const { uiStore } = useCmsContext();
  const active = useStoreSelector(uiStore, (s) => s.activeBlock);
  return <div data-testid="active">{active ?? "none"}</div>;
}

/** @param {{ isAdmin?: boolean, children: React.ReactNode }} props */
const App = ({ isAdmin, children }) => (
  <CmsProvider config={{ baseUrl: BASE }} isAdmin={isAdmin} initialBlocks={BLOCKS}>
    <ActiveProbe />
    {children}
  </CmsProvider>
);

const counter = (
  <EditableRegion blockPath="stats.count" blockType="Number" defaultValue={0} as="p">
    {(value) => <strong>{value} kişi</strong>}
  </EditableRegion>
);

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EditableRegion with a function child", () => {
  it("hands the value over and renders what came back", () => {
    render(<App isAdmin>{counter}</App>);
    expect(screen.getByText("42 kişi")).toBeTruthy();
  });

  it("adds no element of its own for a visitor", () => {
    const { container } = render(<App>{counter}</App>);
    // The wrapper is the region's own span; `as` only decides how it displays.
    expect(container.querySelector("span")).toBeNull();
    expect(screen.getByText("42 kişi")).toBeTruthy();
  });

  it("wraps in admin so the ring has something to hang on", () => {
    const { container } = render(<App isAdmin>{counter}</App>);
    const wrapper = container.querySelector("span");
    expect(wrapper).toBeTruthy();
    // `as="p"` is a block tag, so the wrapper lays out as a block and the halo
    // gets its roomy inset.
    expect(wrapper.style.display).toBe("block");
    expect(wrapper.querySelector("strong")).toBeTruthy();
  });

  it("opens the block from the chip, and only from the chip", () => {
    const { container } = render(<App isAdmin>{counter}</App>);
    const wrapper = container.querySelector("span");

    fireEvent.click(screen.getByText("42 kişi"));
    expect(screen.getByTestId("active").textContent).toBe("none");

    fireEvent.mouseEnter(wrapper);
    fireEvent.click(container.querySelector("button"));
    expect(screen.getByTestId("active").textContent).toBe("stats.count");
  });

  it("takes the enclosing group prefix", () => {
    const { container } = render(
      <App isAdmin>
        <CmsGroup name="hero">
          <EditableRegion blockPath="count" blockType="Number" defaultValue={0} as="p">
            {(value) => <strong>{value}</strong>}
          </EditableRegion>
        </CmsGroup>
      </App>,
    );
    expect(screen.getByText("7")).toBeTruthy();
    fireEvent.mouseEnter(container.querySelector("span"));
    expect(container.querySelector("button").textContent).toContain("hero.count");
  });

  it("stands the in-place editor down, since the caret needs a node we made", () => {
    const { container } = render(
      <App isAdmin>
        <EditableRegion blockPath="post.title" blockType="ShortText" defaultValue="" as="h1">
          {(value) => <span>{value}</span>}
        </EditableRegion>
      </App>,
    );
    expect(screen.getByText("Merhaba")).toBeTruthy();
    expect(container.querySelector("[contenteditable]")).toBeNull();
  });

  it("leaves the built-in rendering alone when children is not a function", () => {
    const { container } = render(
      <App isAdmin>
        <EditableRegion blockPath="post.title" blockType="ShortText" defaultValue="" as="h1" />
      </App>,
    );
    expect(container.querySelector("[contenteditable]")).toBeTruthy();
  });
});
