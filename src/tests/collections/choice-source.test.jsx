// @vitest-environment jsdom
/**
 * @file How a field's `source` decides what the picker offers and writes back.
 *
 * `options` used to hang off any field at all and win over its type, which
 * turned an array field into a single-value select and wrote a bare string into
 * something the payload builder and the validator both read as a list. Only
 * `Select` and `StringArray` carry a source now, so the type answers the question
 * before anything has to decide.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The form only reaches context for its wording, and the keys are enough to
// assert structure, so this keeps the provider stack out of the test.
vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
}));

// A static source needs nothing from the provider, but the hook that reads it
// cannot know that before it runs. Everything else in the module stays real.
vi.mock("../../shared/state/cms-context.js", async (importOriginal) => ({
  .../** @type {*} */ (await importOriginal()),
  useCmsContext: () => ({ config: { transport: {} }, getAccessToken: async () => null }),
}));

import { CollectionFieldsForm } from "../../collections/CollectionFieldsForm.jsx";

afterEach(cleanup);

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

/** @param {string[]} values */
const staticSource = (values) => ({ kind: "static", values });

/**
 * Renders one field and reports what the form handed back on change.
 *
 * @param {*} f
 * @param {*} value
 */
function mountField(f, value) {
  const onChange = vi.fn();
  render(
    <CollectionFieldsForm fields={[f]} values={{ f: value }} onChange={onChange} disabled={false} />,
  );
  return { onChange, lastValue: () => onChange.mock.calls.at(-1)?.[0]?.f };
}

const trigger = () => screen.getByRole("button", { expanded: false });
const openPicker = () => fireEvent.click(trigger());
const optionLabels = () => screen.getAllByRole("option").map((o) => o.textContent.trim());
const search = () => screen.getByPlaceholderText("editors.combobox.search");

describe("StringArray on a closed vocabulary", () => {
  const tagField = field("StringArray", { source: staticSource(["cms", "next", "editör"]) });

  it("offers the vocabulary rather than a single-value select", () => {
    mountField(tagField, []);
    openPicker();
    expect(optionLabels()).toEqual(["cms", "next", "editör"]);
  });

  it("appends to the array instead of replacing it with a string", () => {
    const { lastValue } = mountField(tagField, ["cms"]);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: "next" }));
    expect(lastValue()).toEqual(["cms", "next"]);
  });

  it("lists only what is not already picked", () => {
    mountField(tagField, ["cms"]);
    openPicker();
    expect(optionLabels()).toEqual(["next", "editör"]);
  });

  it("drops the adder once everything is picked", () => {
    mountField(tagField, ["cms", "next", "editör"]);
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });

  it("refuses an entry the vocabulary does not offer", () => {
    const { onChange } = mountField(tagField, []);
    openPicker();
    fireEvent.change(search(), { target: { value: "uydurma" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("StringArray with allowCustom", () => {
  const openField = field("StringArray", { source: staticSource(["cms"]), allowCustom: true });

  it("takes an entry from outside the vocabulary", () => {
    const { lastValue } = mountField(openField, []);
    openPicker();
    fireEvent.change(search(), { target: { value: "uydurma" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(lastValue()).toEqual(["uydurma"]);
  });
});

describe("StringArray with no source at all", () => {
  const freeField = field("StringArray");

  it("creates the typed entry", () => {
    const { lastValue } = mountField(freeField, ["cms"]);
    openPicker();
    fireEvent.change(search(), { target: { value: "yeni" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(lastValue()).toEqual(["cms", "yeni"]);
  });

  it("ignores a duplicate rather than adding it twice", () => {
    const { onChange } = mountField(freeField, ["cms"]);
    openPicker();
    fireEvent.change(search(), { target: { value: "cms" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("splits a multi-line paste into one entry per line", () => {
    const { onChange } = mountField(freeField, []);
    openPicker();
    fireEvent.paste(search(), { clipboardData: { getData: () => "bir\niki\n\nüç" } });
    // Each line is added against the same starting value, so the calls carry one
    // entry each; the form is what accumulates them in real use.
    expect(onChange.mock.calls.map((c) => c[0].f)).toEqual([["bir"], ["iki"], ["üç"]]);
  });
});

describe("Select", () => {
  const selectField = field("Select", { source: staticSource(["a", "b"]) });

  it("stores the chosen entry as a plain string", () => {
    const { lastValue } = mountField(selectField, "");
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: "b" }));
    expect(lastValue()).toBe("b");
  });

  it("lets an optional field go back to unset", () => {
    const { lastValue } = mountField(selectField, "b");
    openPicker();
    // The panel's footer, not a row in the list: as a row it took a slot from
    // the options and shortened the list on its way out.
    fireEvent.click(screen.getByRole("button", { name: "editors.combobox.clearAction" }));
    expect(lastValue()).toBe("");
  });
});

describe("types with no choice source", () => {
  it("leaves Bool as its switch", () => {
    mountField(field("Bool"), false);
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  it("leaves ObjectArray as its own repeat editor", () => {
    const f = field("ObjectArray", {
      itemFields: [field("ShortText", { name: "title", label: "Başlık" })],
    });
    mountField(f, []);
    expect(screen.getByText("collections.noItems")).toBeTruthy();
  });
});
