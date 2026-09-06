// @vitest-environment jsdom
/**
 * @file `BoolEditor`, which is a switch in two different rooms.
 *
 * Both rooms get the same control: the field frame, the value as a word, and
 * the switch on the right edge. What changes is whether a caption sits above
 * it — in the drawer the block card already names the field, so there is none.
 *
 * The switch used to ride the caller's label row with no frame at all, which
 * made it the one control in the drawer that did not start where the others
 * did.
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
  it("carries its caption above the control, not beside it", () => {
    const { container } = render(<BoolEditor value={false} onChange={() => {}} label="Yayında" />);
    expect(screen.getByText("Yayında")).toBeTruthy();
    // The caption is a sibling of the frame, so the frame is free to be the
    // same box every other field draws.
    expect(label(container).contains(screen.getByText("Yayında"))).toBe(false);
  });

  it("wears the field frame in both rooms", () => {
    const { container: withCaption } = render(
      <BoolEditor value={false} onChange={() => {}} label="Yayında" />,
    );
    const { container: bare } = render(<BoolEditor value={false} onChange={() => {}} hideLabel />);
    for (const c of [withCaption, bare]) {
      expect(label(c).className).toContain("inscribed-field");
      expect(label(c).style.justifyContent).toBe("space-between");
    }
  });

  it("says which end is on, so the track is never read alone", () => {
    const { rerender } = render(<BoolEditor value={false} onChange={() => {}} hideLabel />);
    expect(screen.getByText("editors.bool.off")).toBeTruthy();
    rerender(<BoolEditor value onChange={() => {}} hideLabel />);
    expect(screen.getByText("editors.bool.on")).toBeTruthy();
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
