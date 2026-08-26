// @vitest-environment jsdom
/**
 * @file A `Select` / `StringArray` page block gets its choices from the page.
 *
 * These two types draw nothing, so there is no region on the page to hang the
 * vocabulary off; the declaration rides on `useCmsBlock` metadata and reaches
 * the drawer through the runtime registry. The assertions go through what the
 * drawer actually receives rather than through the registry's shape, since the
 * registry is the mechanism and the editor is the contract.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen } from "@testing-library/react";

const seen = vi.hoisted(() => ({ props: /** @type {*[]} */ ([]) }));

vi.mock("../../editors/FieldEditor.jsx", () => ({
  FieldEditor: (/** @type {*} */ props) => {
    seen.props.push(props);
    return <div data-testid="editor">{props.source ? props.source.kind : "no-source"}</div>;
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { BlockCard } from "../../admin/BlockCard.jsx";
import { useCmsBlock } from "../../core/hooks/use-cms-block.js";

const BASE = "https://api.test";

const TAGS = {
  blockPath: "post.tags",
  blockType: "StringArray",
  value: [],
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
};

const SOURCE = { kind: "static", values: ["a", "b"] };

/** The page's own declaration, exactly as a consumer would write it. */
function Declarer({ source }) {
  useCmsBlock("post.tags", source
    ? { blockType: "StringArray", defaultValue: [], source, allowCustom: true }
    : { blockType: "StringArray", defaultValue: [] });
  return null;
}

/** @param {{ declare?: boolean, isAdmin?: boolean }} opts */
function mount({ declare = true, isAdmin = true } = {}) {
  return render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin={isAdmin} initialBlocks={[TAGS]}>
      {declare ? <Declarer source={SOURCE} /> : <Declarer />}
      <BlockCard block={TAGS} displayPath={TAGS.blockPath} topLevel isActive={false} itemSchema={null} />
    </CmsProvider>,
  );
}

beforeEach(() => {
  seen.props = [];
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const last = () => seen.props.at(-1);

describe("choice sources declared through useCmsBlock", () => {
  it("hands the drawer the source the page declared", () => {
    mount();
    expect(screen.getByTestId("editor").textContent).toBe("static");
    expect(last().source).toEqual(SOURCE);
    expect(last().allowCustom).toBe(true);
  });

  it("leaves the editor sourceless when nothing declared one", () => {
    mount({ declare: false });
    expect(screen.getByTestId("editor").textContent).toBe("no-source");
    expect(last().source).toBeNull();
  });

  it("registers nothing outside admin, where no drawer reads it", () => {
    const { container } = render(
      <CmsProvider config={{ baseUrl: BASE }} initialBlocks={[TAGS]}>
        <Declarer source={SOURCE} />
      </CmsProvider>,
    );
    // Nothing to assert on screen: the point is that a public visitor mounts
    // the declaration without it costing a registry write.
    expect(container.textContent).toBe("");
  });

  it("drops the entry when the declaring component leaves the page", () => {
    const { rerender } = mount();
    expect(last().source).toEqual(SOURCE);

    rerender(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[TAGS]}>
        <BlockCard block={TAGS} displayPath={TAGS.blockPath} topLevel isActive={false} itemSchema={null} />
      </CmsProvider>,
    );
    expect(last().source).toBeNull();
  });
});
