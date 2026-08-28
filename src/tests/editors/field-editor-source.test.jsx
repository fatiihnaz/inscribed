// @vitest-environment jsdom
/**
 * @file Which of the two choice types actually needs a vocabulary.
 *
 * A Select without one is a picker offering nothing, so it says so. A
 * StringArray without one is the ordinary tag field, which is the commoner of
 * its two shapes and used to be refused outright.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
  useCmsLocale: () => "tr",
}));
vi.mock("../../shared/state/cms-context.js", () => ({
  useCmsContext: () => ({ config: {}, getAccessToken: async () => null }),
}));

import { FieldEditor } from "../../editors/FieldEditor.jsx";

afterEach(cleanup);

const missing = () => screen.queryByText("editors.combobox.noSource");

describe("a choice field without a source", () => {
  it("leaves a Select saying it has none", () => {
    render(FieldEditor({ blockType: "Select", value: "", onChange: () => {} }));
    expect(missing()).toBeTruthy();
  });

  it("gives a StringArray the free tag field it was always able to be", () => {
    render(FieldEditor({ blockType: "StringArray", value: ["a"], onChange: () => {} }));
    expect(missing()).toBeNull();
    expect(screen.getByText("a")).toBeTruthy();
  });

  it("still lets that tag field remove an entry", () => {
    const onChange = vi.fn();
    render(FieldEditor({ blockType: "StringArray", value: ["a", "b"], onChange }));
    fireEvent.click(screen.getAllByRole("button", { name: /collections\.removeNamed/ })[0]);
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("keeps offering the vocabulary when there is one", () => {
    render(FieldEditor({
      blockType: "StringArray",
      value: [],
      onChange: () => {},
      source: { kind: "static", values: ["x"] },
    }));
    expect(missing()).toBeNull();
  });
});
