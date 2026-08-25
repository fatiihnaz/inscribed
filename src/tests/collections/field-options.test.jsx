// @vitest-environment jsdom
/**
 * @file What `options` means per field type.
 *
 * `options` used to win over `type` outright, which turned a `StringArray` into
 * a single-value `<select>` and wrote a bare string into a field the payload
 * builder and the validator both read as an array. These pin the rule that
 * replaced it: a vocabulary on an array field, one choice on a scalar, ignored
 * where a select cannot express the value.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The form only reaches context for its wording; the keys are enough to assert
// structure, and this keeps the provider stack out of the test.
vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
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
  options: null,
  itemFields: null,
  help: null,
  ...extra,
});

/**
 * Renders one field and reports what the form handed back on change.
 *
 * @param {*} f
 * @param {*} value
 */
function mountField(f, value) {
  const onChange = vi.fn();
  render(
    <CollectionFieldsForm
      fields={[f]}
      values={{ f: value }}
      onChange={onChange}
      disabled={false}
    />,
  );
  return { onChange, lastValue: () => onChange.mock.calls.at(-1)?.[0]?.f };
}

describe("options on a StringArray", () => {
  const tagField = field("StringArray", { options: ["cms", "next", "editör"] });

  it("offers the vocabulary as a picker rather than a single-value select", () => {
    mountField(tagField, []);
    const select = screen.getByRole("combobox");
    // Every option plus the placeholder row.
    expect(select.querySelectorAll("option")).toHaveLength(4);
  });

  it("appends to the array instead of replacing it with a string", () => {
    const { lastValue } = mountField(tagField, ["cms"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "next" } });
    expect(lastValue()).toEqual(["cms", "next"]);
  });

  it("lists only what is not already picked", () => {
    mountField(tagField, ["cms"]);
    const labels = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) => o.value);
    expect(labels).not.toContain("cms");
    expect(labels).toEqual(expect.arrayContaining(["next", "editör"]));
  });

  it("drops the picker once everything is picked", () => {
    mountField(tagField, ["cms", "next", "editör"]);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("options on a free-text StringArray", () => {
  it("ignores a duplicate rather than adding it twice", () => {
    const { onChange } = mountField(field("StringArray"), ["cms"]);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "cms" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("options on other types", () => {
  it("narrows a scalar to one choice", () => {
    const { lastValue } = mountField(field("ShortText", { options: ["a", "b"] }), "");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(lastValue()).toBe("b");
  });

  it("is ignored on a Bool, which keeps its switch", () => {
    mountField(field("Bool", { options: ["evet", "hayır"] }), false);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  it("is ignored on an ObjectArray, which keeps its repeat editor", () => {
    const f = field("ObjectArray", {
      options: ["a", "b"],
      itemFields: [field("ShortText", { name: "title", label: "Başlık" })],
    });
    mountField(f, []);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("collections.noItems")).toBeTruthy();
  });
});
