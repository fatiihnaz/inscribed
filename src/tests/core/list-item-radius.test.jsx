// @vitest-environment jsdom
/**
 * The ring around a list item takes the item's own shape, but only when the
 * item has one.
 *
 * Lists are the case that made this matter: `<EditableRegion>` measures its
 * content for images alone and leaves everything else on the house radius,
 * while a list measures every item. An item rendered as a bare row reports the
 * zero radius it never really had, which used to ring it with hard corners
 * beside identical text that stayed rounded.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act, fireEvent } from "@testing-library/react";

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
import { EditableList } from "../../core/EditableList.jsx";
import { RING_RADIUS } from "../../shared/style/tokens.js";

const PATH = "hero.highlights";
const ITEM_SCHEMA = { text: { blockType: "ShortText", defaultValue: "" } };

const listBlock = () => ({
  blockPath: PATH,
  blockType: "List",
  value: [{ text: "Bir" }, { text: "İki" }],
  draftValue: null,
  version: 1,
  sortOrder: 1,
  _slug: "/",
});

const transport = {
  getContent: async () => ({ slug: "/", blocks: [listBlock()] }),
  getMyCollections: async () => [],
  updateDraft: async () => undefined,
  updateContent: async () => ({ updated: 1, unchanged: 0 }),
  deleteDraft: async () => undefined,
};

const corners = (radius) => ({
  borderTopLeftRadius: radius,
  borderTopRightRadius: radius,
  borderBottomRightRadius: radius,
  borderBottomLeftRadius: radius,
});

/** A card: its own fill and hairline, so it is a box the visitor can see. */
const CARD = {
  ...corners("12px"),
  borderTopWidth: "1px",
  borderRightWidth: "1px",
  borderBottomWidth: "1px",
  borderLeftWidth: "1px",
  backgroundColor: "rgb(255, 255, 255)",
  backgroundImage: "none",
  boxShadow: "none",
};

/** A bare row: text straight on the page, nothing painted around it. */
const BARE = {
  ...corners("0px"),
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  boxShadow: "none",
};

/**
 * jsdom resolves no stylesheets, so the computed values the hook reads are
 * stubbed at that source, keyed on the tag the item renders as.
 */
function stubComputedStyle(byTag) {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const style = real(/** @type {*} */ (el), pseudo);
    const overrides = byTag[/** @type {HTMLElement} */ (el).tagName];
    if (!overrides) return style;
    return /** @type {*} */ (new Proxy(style, {
      get: (target, key) => (typeof key === "string" && key in overrides
        ? overrides[key]
        : Reflect.get(target, key)),
    }));
  });
}

/** @type {HTMLElement} */
let container;

async function mount(renderItem) {
  await act(async () => {
    ({ container } = render(
      <CmsProvider
        config={{ baseUrl: "https://api.test" }}
        transport={/** @type {*} */ (transport)}
        isAdmin
        initialBlocks={[listBlock()]}
      >
        {/* No add slot: it renders the item shape a second time, and one is
            enough to measure. */}
        <EditableList blockPath={PATH} itemSchema={ITEM_SCHEMA} noInlineAdd>
          {renderItem}
        </EditableList>
      </CmsProvider>,
    ));
  });
}

/** The ring hangs on the item's wrapper, and only measures while hovered. */
async function ringAround(selector) {
  const content = /** @type {HTMLElement} */ (container.querySelector(selector));
  const wrapper = /** @type {HTMLElement} */ (content.parentElement);
  await act(async () => { fireEvent.mouseEnter(wrapper); });
  return wrapper;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("list item ring radius", () => {
  it("takes a card's radius, so the ring sits concentric with it", async () => {
    stubComputedStyle({ ARTICLE: CARD });
    await mount((item) => <article>{item.text}</article>);

    expect((await ringAround("article")).style.borderRadius).toBe("12px");
  });

  it("leaves a bare row on the house radius rather than copying its zero", async () => {
    stubComputedStyle({ P: BARE });
    await mount((item) => <p>{item.text}</p>);

    expect((await ringAround("p")).style.borderRadius).toBe(`${RING_RADIUS}px`);
  });

  it("still reads a card that carries only a fill", async () => {
    // One painted surface is enough; a card need not also carry a border.
    stubComputedStyle({
      ARTICLE: { ...BARE, ...corners("8px"), backgroundColor: "rgb(240, 240, 240)" },
    });
    await mount((item) => <article>{item.text}</article>);

    expect((await ringAround("article")).style.borderRadius).toBe("8px");
  });
});
