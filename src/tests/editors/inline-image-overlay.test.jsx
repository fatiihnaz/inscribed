// @vitest-environment jsdom
/**
 * Tests for `<InlineImageOverlay>`: the on-image replace/remove affordance.
 * useImageUpload is mocked (its own contract is covered separately), so these
 * assert the button wiring: remove clears src while keeping alt, a picked file
 * flows through upload into onChange, and remove hides without a src.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const uploadMock = vi.fn();
vi.mock("../../editors/use-image-upload.js", () => ({
  useImageUpload: () => ({
    upload: uploadMock,
    reset: () => {},
    isUploading: false,
    progress: 0,
    error: null,
  }),
}));

// The overlay reads its wording through `useCmsStrings`, which needs a config.
// An empty one resolves to the English catalog, which is what the assertions
// below compare against.
vi.mock("../../shared/state/cms-context.js", () => ({
  useCmsContext: () => ({ config: {} }),
}));

import { InlineImageOverlay } from "../../editors/inline/InlineImageOverlay.jsx";
// Through the catalog, not a literal: the panel's wording is configurable now,
// and a test pinned to one language breaks on a reword rather than on a bug.
import { en } from "../../shared/i18n/en/index.js";

const REPLACE = en["editors.image.replace"];
const REMOVE = en["editors.image.remove"];

beforeEach(() => {
  cleanup();
  uploadMock.mockReset();
});
afterEach(() => cleanup());

describe("InlineImageOverlay", () => {
  it("offers both replace and remove for a filled image", () => {
    render(<InlineImageOverlay value={{ src: "a.jpg", alt: "x" }} onChange={() => {}} />);
    expect(screen.getByText(REPLACE)).toBeTruthy();
    expect(screen.getByText(REMOVE)).toBeTruthy();
  });

  it("clears src while preserving alt on remove", () => {
    const onChange = vi.fn();
    render(<InlineImageOverlay value={{ src: "a.jpg", alt: "x" }} onChange={onChange} />);
    fireEvent.click(screen.getByText(REMOVE));
    expect(onChange).toHaveBeenCalledWith({ src: "", alt: "x" });
  });

  it("uploads a picked file and writes the returned url, preserving alt", async () => {
    uploadMock.mockResolvedValue("cdn.jpg");
    const onChange = vi.fn();
    const { container } = render(
      <InlineImageOverlay value={{ src: "a.jpg", alt: "x" }} onChange={onChange} />,
    );
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "p.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ src: "cdn.jpg", alt: "x" }));
    expect(uploadMock).toHaveBeenCalledWith(file);
  });

  it("hides remove when there is no src", () => {
    render(<InlineImageOverlay value={{ src: "", alt: "" }} onChange={() => {}} />);
    expect(screen.queryByText(REMOVE)).toBeNull();
  });
});
