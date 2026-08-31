// @vitest-environment jsdom
/**
 * @file Which palette the record form wears, and how far down it reaches.
 *
 * The form used to hardcode the portable palette, so a collection field inside
 * the dark drawer sat beside a block field wearing the drawer's own tones and
 * the two read as different products. The palette is a prop now: the drawer
 * surfaces pass `drawer`, and `neutral` stays the default for the host-page
 * ones that reach `CollectionFieldsForm` through the public export.
 *
 * The class is the whole assertion. Both palettes style themselves from the
 * same `--ins-f-*` custom properties, and `.inscribed-neutral` is what
 * overrides them (see `field-css.js`), so a control carrying it is wearing the
 * portable palette and one without it is wearing the drawer's.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

// Same two stubs the sibling form tests use: the form reaches context only for
// its wording, and the keys are enough to assert structure.
vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
}));
vi.mock("../../shared/state/cms-context.js", async (importOriginal) => ({
  .../** @type {*} */ (await importOriginal()),
  useCmsContext: () => ({ config: { transport: {} }, getAccessToken: async () => null }),
}));

import { CollectionFieldsForm } from "../../collections/CollectionFieldsForm.jsx";
import { SlugField } from "../../collections/SlugField.jsx";

afterEach(cleanup);

const NEUTRAL = "inscribed-neutral";

/**
 * @param {string} type
 * @param {Partial<import("../../shared/contracts/schemas.js").CollectionFieldDescriptor>} [extra]
 */
const field = (type, extra = {}) => ({
  name: "f",
  label: "Alan",
  type,
  required: false,
  readOnly: false,
  computed: false,
  filterable: false,
  sortable: false,
  source: null,
  itemFields: null,
  help: null,
  ...extra,
});

/**
 * @param {*} f
 * @param {*} value
 * @param {{ variant?: "drawer" | "neutral" }} [opts]
 */
function mountForm(f, value, opts = {}) {
  const { container } = render(
    <CollectionFieldsForm
      fields={[f]}
      values={{ f: value }}
      onChange={() => {}}
      disabled={false}
      {...opts}
    />,
  );
  return container;
}

describe("CollectionFieldsForm palette", () => {
  it("wears the portable palette by default, which is what a host page gets", () => {
    mountForm(field("ShortText"), "");
    expect(screen.getByRole("textbox").className).toContain(NEUTRAL);
  });

  it("wears the drawer's palette when asked, so it matches the block fields beside it", () => {
    mountForm(field("ShortText"), "", { variant: "drawer" });
    expect(screen.getByRole("textbox").className).not.toContain(NEUTRAL);
  });

  // The collection accent is the surface's, not the palette's: it is what turns
  // every focus ring inside a record form pink, and it stays on either one.
  it("stays a collection surface in both palettes", () => {
    for (const variant of /** @type {const} */ (["neutral", "drawer"])) {
      cleanup();
      const container = mountForm(field("ShortText"), "", { variant });
      expect(container.querySelector(".inscribed-collection")).toBeTruthy();
    }
  });

  // The repeatable's cards style themselves from the custom properties and
  // carried no palette class of their own, so inside a portable form they came
  // out in the drawer's tones. The shell wears the class now, and the cards
  // inherit it.
  it("reaches the repeatable's own cards, not just the inputs inside them", () => {
    const container = mountForm(
      field("ObjectArray", { itemFields: [field("ShortText", { name: "title" })] }),
      [{ title: "A" }],
    );
    const card = container.querySelector(".inscribed-repeat-item");
    expect(card).toBeTruthy();
    expect(card?.closest(`.${NEUTRAL}`)).toBeTruthy();
  });

  it("hands the repeatable the drawer's palette too", () => {
    const container = mountForm(
      field("ObjectArray", { itemFields: [field("ShortText", { name: "title" })] }),
      [{ title: "A" }],
      { variant: "drawer" },
    );
    const card = container.querySelector(".inscribed-repeat-item");
    expect(card).toBeTruthy();
    expect(card?.closest(`.${NEUTRAL}`)).toBeNull();
  });
});

describe("SlugField palette", () => {
  it("defaults to the portable palette", () => {
    render(<SlugField value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox").className).toContain(NEUTRAL);
  });

  // The create pane stacks this above the record form; two palettes there would
  // read as the address belonging to some other form.
  it("takes the drawer's palette, matching the form it sits above", () => {
    render(<SlugField value="" onChange={() => {}} variant="drawer" />);
    expect(screen.getByRole("textbox").className).not.toContain(NEUTRAL);
  });
});
