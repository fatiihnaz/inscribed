// @vitest-environment jsdom
/**
 * @file `BoolEditor`, which is a switch in two different rooms.
 *
 * In a collection form it is a settings row: caption on the left, switch on the
 * right. In the drawer the block card already names the field, so there is no
 * caption and the row must not survive as an empty column pushing the switch to
 * the far edge.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
  useCmsLocale: () => "tr",
}));

import { BoolEditor } from "../../editors/fields/BoolEditor.jsx";

afterEach(cleanup);

const label = (/** @type {HTMLElement} */ container) => container.querySelector("label");

describe("BoolEditor", () => {
  it("lays out as a settings row when it carries its own caption", () => {
    const { container } = render(<BoolEditor value={false} onChange={() => {}} label="Yayında" />);
    expect(screen.getByText("Yayında")).toBeTruthy();
    expect(label(container).style.justifyContent).toBe("space-between");
  });

  it("shrinks to the switch when the caption is somewhere else", () => {
    const { container } = render(<BoolEditor value={false} onChange={() => {}} hideLabel />);
    // No empty column left behind, and the label stops at the control rather
    // than spanning the panel as an invisible toggle target.
    expect(label(container).querySelector("div")).toBeNull();
    expect(label(container).style.display).toBe("inline-flex");
    expect(label(container).style.justifyContent).toBe("flex-start");
  });

  it("drops a caption it was given once hideLabel says so", () => {
    render(<BoolEditor value={false} onChange={() => {}} label="Yayında" hideLabel />);
    expect(screen.queryByText("Yayında")).toBeNull();
  });

  it("reports the new state from the checkbox that is still in the tree", () => {
    const onChange = vi.fn();
    render(<BoolEditor value={false} onChange={onChange} label="Yayında" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
