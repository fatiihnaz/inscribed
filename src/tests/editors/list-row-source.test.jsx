// @vitest-environment jsdom
/**
 * @file A `Select` column inside a list, and where its vocabulary lives.
 *
 * It rides on the row schema rather than the registry a page block uses, because
 * it belongs to one column and not to the row. And like every other vocabulary
 * it stops at the drawer: the manifest never carries it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

const seen = vi.hoisted(() => ({ props: /** @type {*[]} */ ([]) }));

vi.mock("../../editors/FieldEditor.jsx", () => ({
  FieldEditor: (/** @type {*} */ props) => {
    seen.props.push(props);
    return <div data-testid={`editor-${props.blockType}`}>{props.source?.kind ?? "no-source"}</div>;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { ListEditor } from "../../editors/ListEditor.jsx";

const BASE = "https://api.test";

const SCHEMA = {
  ad: { blockType: "ShortText", defaultValue: "" },
  durum: {
    blockType: "Select",
    defaultValue: "taslak",
    source: { kind: "static", values: ["taslak", "yayında"] },
  },
};

beforeEach(() => {
  seen.props = [];
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Rows come collapsed and only mount their fields once opened, so every
 * assertion here has to open one first.
 *
 * @param {*} value
 */
function mount(value) {
  const rendered = render(
    <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[]}>
      <ListEditor blockPath="x.rows" value={value} onChange={() => {}} itemSchema={SCHEMA} />
    </CmsProvider>,
  );
  fireEvent.click(rendered.container.querySelector(".inscribed-repeat-row-header"));
  return rendered;
}

const propsFor = (/** @type {string} */ blockType) =>
  seen.props.find((p) => p.blockType === blockType);

describe("a Select column in a list row", () => {
  it("hands the column its own vocabulary", () => {
    mount([{ ad: "Bir", durum: "taslak" }]);
    expect(screen.getByTestId("editor-Select").textContent).toBe("static");
    expect(propsFor("Select").source).toEqual(SCHEMA.durum.source);
  });

  it("leaves the columns that carry none with nothing", () => {
    mount([{ ad: "Bir", durum: "taslak" }]);
    expect(propsFor("ShortText").source).toBeNull();
  });
});
