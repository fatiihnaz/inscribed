// @vitest-environment jsdom
/**
 * @file Which lane a block type takes in the drawer.
 *
 * A scalar is a form field, always open, with no disclosure to click; only the
 * types that carry a surface of their own (rich text, an image, a repeatable)
 * earn a collapsible card. The set drifted once already: the scalars added after
 * the split kept landing on the card lane, which is how a boolean ended up
 * behind a chevron.
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

/** @param {string} blockType @param {*} [value] */
function mount(blockType, value = "") {
  const block = makeBlock(blockType, value);
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[block]}>
      <BlockCard block={block} displayPath="x.y" topLevel isActive={false} itemSchema={null} />
    </CmsProvider>,
  );
}

// Both lanes wear `.inscribed-field-row`; the disclosure header is what only
// the card lane has.
const isFieldLane = (/** @type {HTMLElement} */ c) => !c.querySelector(".inscribed-disclosure-header");

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("block weight", () => {
  it.each(["ShortText", "LongText", "Number", "Bool", "Url", "Date", "Link", "Select", "StringArray"])(
    "gives %s the always-open field lane",
    (blockType) => {
      const { container } = mount(blockType);
      expect(isFieldLane(container)).toBe(true);
    },
  );

  it.each(["RichText", "Image", "ObjectArray"])("keeps %s on the card lane", (blockType) => {
    const { container } = mount(blockType);
    expect(isFieldLane(container)).toBe(false);
  });

  it("keeps a type this build never heard of on the card lane, where it is explained", () => {
    const { container } = mount("SomethingNewer");
    expect(isFieldLane(container)).toBe(false);
  });

  it("puts the switch on the label row rather than a line of its own", () => {
    const { container } = mount("Bool", true);
    const labelRow = container.querySelector(".inscribed-field-row > div");
    expect(labelRow.querySelector("[data-testid=editor]")).toBeTruthy();
    // Nothing else to indent under the label, so the guide body stands down.
    expect(container.querySelectorAll("[data-testid=editor]")).toHaveLength(1);
  });

  it("still opens a guide body for the fields that need one", () => {
    const { container } = mount("ShortText");
    const labelRow = container.querySelector(".inscribed-field-row > div");
    expect(labelRow.querySelector("[data-testid=editor]")).toBeNull();
    expect(container.querySelector("[data-testid=editor]")).toBeTruthy();
  });
});
