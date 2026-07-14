// @vitest-environment jsdom
/**
 * Tests for `useImageUpload()`: the shared upload flow behind the config
 * transport. Context is mocked to a stub transport, so these lock the contract
 * both ImageEditor and InlineImageOverlay depend on: reject non-images, return
 * the CDN url with the access token attached, and surface an error on a missing
 * url.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const uploadImage = vi.fn();
vi.mock("../lib/context.js", () => ({
  useCmsContext: () => ({
    config: { transport: { uploadImage } },
    getAccessToken: async () => "tok",
  }),
}));

import { useImageUpload } from "../hooks/use-image-upload.js";

beforeEach(() => uploadImage.mockReset());

describe("useImageUpload", () => {
  it("rejects non-image files without calling the transport", async () => {
    const { result } = renderHook(() => useImageUpload());
    let url;
    await act(async () => {
      url = await result.current.upload(new File(["x"], "a.txt", { type: "text/plain" }));
    });
    expect(url).toBeNull();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it("uploads an image and returns the CDN url with the access token", async () => {
    uploadImage.mockResolvedValue({ data: { url: "https://cdn/x.jpg" } });
    const { result } = renderHook(() => useImageUpload());
    const file = new File(["x"], "a.png", { type: "image/png" });
    let url;
    await act(async () => {
      url = await result.current.upload(file);
    });
    expect(url).toBe("https://cdn/x.jpg");
    expect(uploadImage).toHaveBeenCalledWith(file, expect.objectContaining({ accessToken: "tok" }));
  });

  it("surfaces an error and returns null when the url is missing", async () => {
    uploadImage.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useImageUpload());
    let url;
    await act(async () => {
      url = await result.current.upload(new File(["x"], "a.png", { type: "image/png" }));
    });
    expect(url).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
