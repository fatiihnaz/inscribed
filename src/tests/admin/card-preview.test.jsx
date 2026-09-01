// @vitest-environment jsdom
/**
 * @file What a closed block card shows of its own value.
 *
 * Only the heavy types close: the light ones (`ShortText`, `Bool`, `Date` and
 * the rest) render their real editor inline and are never collapsed, so their
 * value is already on screen. That leaves `RichText`, `Image` and `ObjectArray`
 * as the only rows with a preview to get right.
 *
 * The header is two lines: the path names the field, the value below it shows
 * what is in it. They used to share one line, with the path taking the width
 * and the value squeezed into a 45% tail, which put the row's only content in
 * its smallest and faintest slot.
 *
 * A thumbnail was tried here and taken back out: an `Image` whose source is set
 * but does not load draws an empty framed box, which is worse than the filename
 * it replaced, and `src` being present is no promise that it resolves.
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
import { BlockCard } from "../../admin/BlockCard.jsx";
import { createCmsConfig } from "../../shared/config.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";
import { fieldRowStyle, fieldEditorWrapStyle } from "../../admin/BlockCard.jsx";
import {
  cardLabelStyle, fieldPathStyle, disclosureRowStyle, disclosureBodyStyle,
} from "../../admin/block-card-chrome.jsx";

const t = createTranslator(resolveStrings("en"), "en");
const CONFIG = createCmsConfig({ baseUrl: "https://api.test" });

const jsonRes = (body) => new Response(JSON.stringify(body), { status: 200 });

/** @param {string} blockType @param {*} value */
const block = (blockType, value) => ({
  blockPath: "hero.media",
  blockType,
  value,
  draftValue: null,
  version: 1,
  sortOrder: 1,
});

function renderCard(b) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/cms/collections/me")) return jsonRes([]);
    return jsonRes({ slug: "/", blocks: [] });
  });
  return render(
    <CmsProvider config={CONFIG} isAdmin getAccessToken={async () => "tok"}>
      <BlockCard block={b} isActive={false} topLevel itemSchema={null} />
    </CmsProvider>,
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const header = () => document.querySelector(".inscribed-disclosure-header");

describe("the closed cards", () => {
  // No picture, on purpose: see the file header.
  it("previews an image by naming it, not by drawing it", async () => {
    renderCard(block("Image", { src: "/senlik.jpg", alt: "Bahar" }));
    await waitFor(() => expect(header()).toBeTruthy());

    expect(document.querySelector(".inscribed-disclosure-header img")).toBeNull();
    expect(header()?.textContent).toContain("Bahar");
  });

  it("previews rich text as its own words", async () => {
    renderCard(block("RichText", "<p>Kampüste bahar şenliği</p>"));
    await waitFor(() => expect(header()).toBeTruthy());

    expect(header()?.textContent).toContain("Kampüste bahar şenliği");
  });

  it("previews a repeatable by how many rows it holds", async () => {
    renderCard(block("ObjectArray", [{}, {}, {}]));
    await waitFor(() => expect(header()).toBeTruthy());
    expect(header()?.textContent).toContain(t("block.items", { count: 3 }));
  });
});

describe("the light types", () => {
  // They are never closed, so there is nothing to preview: the editor itself is
  // the value, already on screen.
  it("open straight into their editor rather than a preview", async () => {
    renderCard(block("ShortText", "Bahar Şenliği"));
    await waitFor(() => expect(document.querySelector(".inscribed-field-row")).toBeTruthy());

    expect(header()).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("the closed card's two lines", () => {
  const label = () => document.querySelector(".inscribed-row-label");
  const value = () => document.querySelector(".inscribed-card-preview");

  // The path is the caption now, not the line: it is what you scan a form by,
  // and the value is what you came to read.
  it("captions with the path and reads with the value", async () => {
    renderCard(block("RichText", "<p>Kampüste bahar şenliği</p>"));
    await waitFor(() => expect(value()).toBeTruthy());

    const base = (el) => Number(/([\d.]+)px/.exec(el?.style.fontSize ?? "")?.[1]);
    expect(label()?.textContent).toContain("hero.media");
    expect(base(value())).toBeGreaterThan(base(label()));
  });

  // Said in the panel's voice, so an unfilled field is distinguishable from one
  // whose preview simply could not be built.
  it("names an empty field rather than leaving the line blank", async () => {
    renderCard(block("RichText", ""));
    await waitFor(() => expect(label()).toBeTruthy());
    expect(screen.getByText(t("block.emptyValue"))).toBeTruthy();
  });

  // Open, the editor below is showing the same thing, so the line folds away
  // rather than printing the value twice.
  it("folds the value away once the card is open", async () => {
    renderCard(block("RichText", "<p>Kampüste bahar şenliği</p>"));
    await waitFor(() => expect(value()).toBeTruthy());

    const slot = () => value()?.parentElement?.parentElement;
    expect(slot()?.style.gridTemplateRows).toBe("1fr");

    fireEvent.click(/** @type {HTMLElement} */ (header()));
    await waitFor(() => expect(slot()?.style.gridTemplateRows).toBe("0fr"));
  });

  // A height that animates rather than snapping, on the drawer's own curve.
  it("animates that fold instead of cutting to it", async () => {
    renderCard(block("RichText", "<p>x</p>"));
    await waitFor(() => expect(value()).toBeTruthy());

    const slot = value()?.parentElement?.parentElement;
    expect(slot?.style.transition).toContain("grid-template-rows");
  });
});

describe("the two lanes' shared vocabulary", () => {
  // An always-open field and an opened heavy block are the same shape: a
  // caption, then a body hung off a guide. They were spaced two different ways,
  // and the comment claiming they matched was only true horizontally.
  it("spaces an open field exactly like an opened card", () => {
    expect(fieldRowStyle).toBe(disclosureRowStyle);
    expect(fieldEditorWrapStyle).toBe(disclosureBodyStyle);
  });

  // One label object, so the two cannot drift apart again and both can be
  // lifted by whatever hover rule their lane has.
  it("captions both lanes with the same label", () => {
    expect(fieldPathStyle).toBe(cardLabelStyle);
    expect(fieldPathStyle.color).toBeUndefined();
  });
});
