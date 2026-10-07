// @vitest-environment jsdom
/**
 * A page's `seo.*` rows in the drawer: named for what they are, a note under
 * each, and a question before the noindex switch hides the page.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/hakkinda",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { BlockCard } from "../../admin/BlockCard.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { en } from "../../shared/i18n/en/index.js";

/** @param {string} blockPath @param {string} blockType @param {*} value @param {string} [slug] */
const seoBlock = (blockPath, blockType, value, slug = "/hakkinda") => ({
  blockPath, blockType, value, draftValue: null, version: 1, sortOrder: 1, _slug: slug,
});

let drafts = /** @type {Map<string, *>} */ (new Map());
function DraftProbe() {
  const { contentDraftsStore } = useCmsContext();
  drafts = useStoreSelector(contentDraftsStore, (m) => m);
  return null;
}

/** @param {{ block: *, config?: * }} props */
function renderCard({ block, config }) {
  return render(
    <CmsProvider config={config ?? { baseUrl: "https://api.test" }}>
      <DraftProbe />
      <BlockCard block={block} displayPath={block.blockPath} topLevel isActive={false} itemSchema={null} />
    </CmsProvider>,
  );
}

afterEach(() => {
  cleanup();
  drafts = new Map();
  vi.restoreAllMocks();
});

describe("a page's seo rows", () => {
  it("name the field and count the title", () => {
    renderCard({ block: seoBlock("seo.title", "ShortText", "Hakkında") });
    expect(screen.getByText(en["seo.title"])).toBeTruthy();
    expect(screen.getByText(en["seo.titleNote_other"].replace("{count}", "8"))).toBeTruthy();
  });

  it("tell the home page's title it stands alone", () => {
    renderCard({ block: seoBlock("seo.title", "ShortText", "Acme", "/") });
    expect(screen.getByText(en["seo.homeTitleNote_other"].replace("{count}", "4"))).toBeTruthy();
  });

  it("ask before the noindex switch hides the page, and write nothing until asked", () => {
    renderCard({ block: seoBlock("seo.noindex", "Bool", false) });
    fireEvent.click(/** @type {Element} */ (document.querySelector("input[type=checkbox]")));

    expect(screen.getByText(en["seo.noindexConfirmTitle"])).toBeTruthy();
    expect(drafts.has("seo.noindex")).toBe(false);

    fireEvent.click(screen.getByText(en["seo.noindexConfirm"]));
    expect(drafts.get("seo.noindex")).toBe(true);
    expect(screen.getByText(en["seo.noindexOn"])).toBeTruthy();
  });

  it("leave the page visible when the question is declined", () => {
    renderCard({ block: seoBlock("seo.noindex", "Bool", false) });
    fireEvent.click(/** @type {Element} */ (document.querySelector("input[type=checkbox]")));
    fireEvent.click(screen.getByText(en["seo.noindexCancel"]));
    expect(drafts.has("seo.noindex")).toBe(false);
  });

  it("let noindex be turned off without asking", () => {
    renderCard({ block: seoBlock("seo.noindex", "Bool", true) });
    fireEvent.click(/** @type {Element} */ (document.querySelector("input[type=checkbox]")));
    expect(screen.queryByText(en["seo.noindexConfirmTitle"])).toBe(null);
    expect(drafts.get("seo.noindex")).toBe(false);
  });
});
