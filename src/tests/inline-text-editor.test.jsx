// @vitest-environment jsdom
/**
 * Tests for `<InlineTextEditor>`: the uncontrolled sync (seed + external
 * replacement without clobbering), input forwarding, focus/blur callbacks, the
 * single-line Enter guard, and the plain-text paste contract (HTML blocked).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { InlineTextEditor } from "../components/InlineTextEditor.jsx";

beforeEach(() => {
  cleanup();
});
afterEach(() => {
  cleanup();
});

describe("InlineTextEditor", () => {
  it("seeds the value into the DOM and mirrors external replacements", () => {
    const { rerender } = render(
      <InlineTextEditor tag="p" value="Merhaba" onInput={() => {}} />,
    );
    const el = screen.getByRole("textbox");
    expect(el.textContent).toBe("Merhaba");

    // An external value change (reset/refetch) flows into the DOM.
    rerender(<InlineTextEditor tag="p" value="Dünya" onInput={() => {}} />);
    expect(el.textContent).toBe("Dünya");
  });

  it("does not rewrite the DOM when the value already matches (no caret clobber)", () => {
    const { rerender } = render(
      <InlineTextEditor tag="p" value="aynı" onInput={() => {}} />,
    );
    const el = screen.getByRole("textbox");
    // Simulate the caret marker a browser would keep; a redundant sync would
    // wipe it. Re-render with the same value and assert the node survives.
    const marker = document.createComment("caret");
    el.appendChild(marker);
    rerender(<InlineTextEditor tag="p" value="aynı" onInput={() => {}} />);
    expect(el.contains(marker)).toBe(true);
  });

  it("forwards input as the element's textContent", () => {
    const onInput = vi.fn();
    render(<InlineTextEditor tag="span" value="" onInput={onInput} />);
    const el = screen.getByRole("textbox");
    el.textContent = "yeni metin";
    fireEvent.input(el);
    expect(onInput).toHaveBeenCalledWith("yeni metin");
  });

  it("fires focus and blur callbacks", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <InlineTextEditor tag="span" value="" onInput={() => {}} onFocus={onFocus} onBlur={onBlur} />,
    );
    const el = screen.getByRole("textbox");
    fireEvent.focus(el);
    fireEvent.blur(el);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("blocks Enter for single-line types but allows it otherwise", () => {
    const { rerender } = render(
      <InlineTextEditor tag="span" value="" singleLine onInput={() => {}} />,
    );
    const el = screen.getByRole("textbox");
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(el, { key: "Enter" })).toBe(false);

    rerender(<InlineTextEditor tag="div" value="" singleLine={false} onInput={() => {}} />);
    expect(fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })).toBe(true);
  });

  it("prevents the default paste so HTML never enters the block", () => {
    const onInput = vi.fn();
    render(<InlineTextEditor tag="span" value="" onInput={onInput} />);
    const el = screen.getByRole("textbox");
    const prevented =
      fireEvent.paste(el, { clipboardData: { getData: () => "yapıştırılan" } }) === false;
    expect(prevented).toBe(true);
    expect(onInput).toHaveBeenCalled();
  });

  it("reflects empty state via the data-empty attribute for the placeholder", () => {
    const { rerender } = render(
      <InlineTextEditor tag="span" value="" placeholder="Metin ekle…" onInput={() => {}} />,
    );
    const el = screen.getByRole("textbox");
    expect(el.hasAttribute("data-empty")).toBe(true);
    expect(el.getAttribute("data-placeholder")).toBe("Metin ekle…");

    rerender(
      <InlineTextEditor tag="span" value="dolu" placeholder="Metin ekle…" onInput={() => {}} />,
    );
    expect(el.hasAttribute("data-empty")).toBe(false);
  });
});
