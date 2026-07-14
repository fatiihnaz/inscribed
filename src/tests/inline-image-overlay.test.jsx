// @vitest-environment jsdom
/**
 * Tests for `<InlineImageOverlay>`: the on-image replace/remove affordance.
 * useImageUpload is mocked (its own contract is covered separately), so these
 * assert the button wiring: Kaldır clears src while keeping alt, a picked file
 * flows through upload into onChange, and Kaldır hides without a src.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const uploadMock = vi.fn();
vi.mock("../hooks/use-image-upload.js", () => ({
  useImageUpload: () => ({
    upload: uploadMock,
    reset: () => {},
    isUploading: false,
    progress: 0,
    error: null,
  }),
}));

import { InlineImageOverlay } from "../components/InlineImageOverlay.jsx";

beforeEach(() => {
  cleanup();
  uploadMock.mockReset();
});
afterEach(() => cleanup());

describe("InlineImageOverlay", () => {
  it("shows Değiştir and Kaldır for a filled image", () => {
    render(<InlineImageOverlay value={{ src: "a.jpg", alt: "x" }} onChange={() => {}} />);
    expect(screen.getByText("Değiştir")).toBeTruthy();
    expect(screen.getByText("Kaldır")).toBeTruthy();
  });

  it("Kaldır clears src while preserving alt", () => {
    const onChange = vi.fn();
    render(<InlineImageOverlay value={{ src: "a.jpg", alt: "x" }} onChange={onChange} />);
    fireEvent.click(screen.getByText("Kaldır"));
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

  it("hides Kaldır when there is no src", () => {
    render(<InlineImageOverlay value={{ src: "", alt: "" }} onChange={() => {}} />);
    expect(screen.queryByText("Kaldır")).toBeNull();
  });
});
