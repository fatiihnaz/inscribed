// @vitest-environment jsdom
/**
 * @file What a block type's weight decides in the drawer.
 *
 * Not the shape: every row is the same shell, header and all. Weight picks the
 * resting state — a scalar is a form field and starts open, while the types
 * carrying a surface of their own (rich text, an image, a repeatable) start
 * shut behind their preview. The set drifted once already: the scalars added
 * after the split kept landing on the heavy side, which is how a boolean ended
 * up needing a click to reach one switch.
 *
 * The density switch overrides the resting state page-wide, which is the other
 * half of this contract.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

vi.mock("../../editors/FieldEditor.jsx", () => ({
  FieldEditor: (/** @type {*} */ props) => <div data-testid="editor">{props.blockType}</div>,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { BlockCard } from "../../admin/BlockCard.jsx";

const BASE = "https://api.test";

/** @param {string} blockType @param {*} value */
const makeBlock = (blockType, value) => ({
  blockPath: "x.y",
  blockType,
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

/** @param {string} blockType @param {*} [value] @param {"comfortable"|"compact"} [density] */
function mount(blockType, value = "", density) {
  const block = makeBlock(blockType, value);
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin initialPages={[{ slug: "/", blocks: [block] }]}>
      <BlockCard
        block={block}
        displayPath="x.y"
        topLevel
        isActive={false}
        itemSchema={null}
        density={density}
      />
    </CmsProvider>,
  );
}

// The body is mounted either way; `.is-open` is what puts it on screen, and
// `aria-hidden` is what the row tells assistive tech.
const isOpen = (/** @type {HTMLElement} */ c) =>
  Boolean(c.querySelector(".inscribed-collapse.is-open"));

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("block weight", () => {
  const LIGHT = ["ShortText", "LongText", "Number", "Bool", "Url", "Date", "Link", "Select", "StringArray"];
  const HEAVY = ["RichText", "Image", "ObjectArray"];

  it.each(LIGHT)("starts %s open, with its editor already on screen", (blockType) => {
    const { container } = mount(blockType);
    expect(isOpen(container)).toBe(true);
  });

  it.each(HEAVY)("starts %s shut behind its preview", (blockType) => {
    const { container } = mount(blockType);
    expect(isOpen(container)).toBe(false);
  });

  it("starts a type this build never heard of shut, where there is a message for it", () => {
    const { container } = mount("SomethingNewer");
    expect(isOpen(container)).toBe(false);
  });

  it("gives both weights the same shell, so either can be collapsed", () => {
    for (const blockType of [...LIGHT, ...HEAVY]) {
      const { container } = mount(blockType);
      expect(container.querySelector(".inscribed-disclosure-header")).toBeTruthy();
      cleanup();
    }
  });

  it("puts every control in the body, the switch included", () => {
    const { container } = mount("Bool", true);
    const body = container.querySelector(".inscribed-collapse");
    expect(body.querySelector("[data-testid=editor]")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid=editor]")).toHaveLength(1);
  });

  it("lets the density switch shut a light field that would otherwise be open", () => {
    const { container } = mount("ShortText", "", "compact");
    expect(isOpen(container)).toBe(false);
  });
});
