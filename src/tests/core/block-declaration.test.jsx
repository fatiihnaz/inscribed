// @vitest-environment jsdom
/**
 * @file The two places a block gets declared, and what each is for.
 *
 * `<EditableRegion>` is the one with an element to wrap, so it carries the ring
 * and the chip; the hook's metadata is the path for a value with no presence on
 * screen. Both register the same things, so they route through one lifecycle.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { useCmsBlock } from "../../core/hooks/use-cms-block.js";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";

const BASE = "https://api.test";
const SOURCE = { kind: "static", values: ["a", "b"] };

const block = (/** @type {string} */ blockPath) => ({
  blockPath,
  blockType: "Select",
  value: "",
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

/** Prints what the drawer would find in the registry for one path. */
function Probe({ blockPath }) {
  const { registryStore } = useCmsContext();
  const entry = useStoreSelector(registryStore, (s) => s.choiceSources.get(blockPath) ?? null);
  return <div data-testid="entry">{entry ? entry.source.kind : "none"}</div>;
}

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("declaring a block from the hook", () => {
  it("registers the vocabulary it was given", () => {
    function Declarer() {
      useCmsBlock("meta.durum", { blockType: "Select", defaultValue: "", source: SOURCE });
      return null;
    }

    const { getByTestId } = render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[block("meta.durum")]}>
        <Probe blockPath="meta.durum" />
        <Declarer />
      </CmsProvider>,
    );
    expect(getByTestId("entry").textContent).toBe("static");
  });

  it("drops it again when the declaring component leaves the page", () => {
    function Declarer() {
      useCmsBlock("meta.durum", { blockType: "Select", defaultValue: "", source: SOURCE });
      return null;
    }

    const tree = (/** @type {boolean} */ withDeclarer) => (
      <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[block("meta.durum")]}>
        <Probe blockPath="meta.durum" />
        {withDeclarer ? <Declarer /> : null}
      </CmsProvider>
    );

    const { getByTestId, rerender } = render(tree(true));
    expect(getByTestId("entry").textContent).toBe("static");
    rerender(tree(false));
    expect(getByTestId("entry").textContent).toBe("none");
  });

  it("registers nothing outside admin, where no drawer reads it", () => {
    function Declarer() {
      useCmsBlock("meta.durum", { blockType: "Select", defaultValue: "", source: SOURCE });
      return null;
    }

    const { getByTestId } = render(
      <CmsProvider config={{ baseUrl: BASE }} initialBlocks={[block("meta.durum")]}>
        <Probe blockPath="meta.durum" />
        <Declarer />
      </CmsProvider>,
    );
    expect(getByTestId("entry").textContent).toBe("none");
  });

  it("says nothing about being the old way, because it is not", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Declarer() {
      useCmsBlock("meta.durum", { blockType: "Select", defaultValue: "", source: SOURCE });
      return null;
    }

    render(
      <CmsProvider config={{ baseUrl: BASE }} isAdmin initialBlocks={[block("meta.durum")]}>
        <Declarer />
      </CmsProvider>,
    );
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("meta.durum"))).toHaveLength(0);
  });
});
