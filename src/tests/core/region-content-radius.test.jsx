// @vitest-environment jsdom
/**
 * The edit ring takes the shape of the content it rings.
 *
 * The ring is an `outline` whose corners the browser derives from the
 * wrapper's own `border-radius` plus the offset, so matching the wrapper to the
 * content is the whole mechanism. Measured from computed style rather than read
 * off the `style` prop, since a radius just as often comes from a class.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

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
import { EditableRegion } from "../../core/EditableRegion.jsx";
import { RING_RADIUS } from "../../shared/style/tokens.js";

const PATH = "hero.cover";

const imageBlock = () => ({
  blockPath: PATH,
  blockType: "Image",
  value: { src: "https://example.test/a.png", alt: "" },
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

const textBlock = () => ({
  blockPath: "hero.title",
  blockType: "ShortText",
  value: "Başlık",
  draftValue: null,
  version: 1,
  sortOrder: 2,
  _slug: "/",
});

const transport = {
  getContent: async () => ({ slug: "/", blocks: [imageBlock(), textBlock()] }),
  getMyCollections: async () => [],
  updateDraft: async () => undefined,
  updateContent: async () => ({ updated: 1, unchanged: 0 }),
  deleteDraft: async () => undefined,
};

/**
 * jsdom resolves no stylesheets, so the radius the hook would read is stubbed
 * at the source it actually reads: computed style.
 */
function stubComputedRadius(radius) {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const style = real(/** @type {*} */ (el), pseudo);
    if (/** @type {HTMLElement} */ (el).tagName !== "IMG") return style;
    return /** @type {*} */ (new Proxy(style, {
      get: (target, key) => (typeof key === "string" && key.startsWith("borderTop")
        || typeof key === "string" && key.startsWith("borderBottom")
        ? radius
        : Reflect.get(target, key)),
    }));
  });
}

/** @type {HTMLElement} */
let container;

async function mount(children) {
  await act(async () => {
    ({ container } = render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[imageBlock(), textBlock()]}
      >
        {children}
      </CmsProvider>,
    ));
  });
}

/** The wrapper is the ringed element: the content's parent. */
const ringAround = (selector) => {
  const content = container.querySelector(selector);
  return /** @type {HTMLElement} */ (content?.parentElement);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ring radius", () => {
  it("takes a circular avatar's radius, so the ring comes out round", async () => {
    stubComputedRadius("50%");
    await mount(<EditableRegion blockPath={PATH} blockType="Image" defaultValue={{ src: "", alt: "" }} />);

    expect(ringAround("img").style.borderRadius).toBe("50%");
  });

  it("takes a square photo's zero, so the ring stops cutting its corners", async () => {
    stubComputedRadius("0px");
    await mount(<EditableRegion blockPath={PATH} blockType="Image" defaultValue={{ src: "", alt: "" }} />);

    expect(ringAround("img").style.borderRadius).toBe("0px");
  });

  it("carries a pixel radius through unchanged", async () => {
    stubComputedRadius("8px");
    await mount(<EditableRegion blockPath={PATH} blockType="Image" defaultValue={{ src: "", alt: "" }} />);

    expect(ringAround("img").style.borderRadius).toBe("8px");
  });

  it("leaves text on the house radius, having no visible box to match", async () => {
    stubComputedRadius("50%");
    await mount(
      <EditableRegion blockPath="hero.title" blockType="ShortText" defaultValue="" as="h1" />,
    );

    expect(ringAround("h1").style.borderRadius).toBe(`${RING_RADIUS}px`);
  });
});
