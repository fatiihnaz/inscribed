// @vitest-environment jsdom
/**
 * Tests for `useFileUpload()`: the `File` field's upload flow. Context is
 * mocked to a stub transport, so these lock what the editor depends on: the
 * whole value comes back (not just the url), the access token rides along, and
 * a transport with no `uploadFile` says so rather than falling through to the
 * image endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const uploadFile = vi.fn();
const uploadImage = vi.fn();
let transport = { uploadFile, uploadImage };

vi.mock("../../shared/state/cms-context.js", () => ({
  useCmsContext: () => ({
    config: { get transport() { return transport; } },
    getAccessToken: async () => "tok",
  }),
}));

import { useFileUpload } from "../../editors/use-file-upload.js";

beforeEach(() => {
  uploadFile.mockReset();
  uploadImage.mockReset();
  transport = { uploadFile, uploadImage };
});

describe("useFileUpload", () => {
  it("returns the whole value, reading name/mime/size off the local file", async () => {
    uploadFile.mockResolvedValue({ data: { url: "https://cdn/a3f9.pdf" } });
    const { result } = renderHook(() => useFileUpload());
    const file = new File(["hello"], "rapor.pdf", { type: "application/pdf" });
    let value;
    await act(async () => {
      value = await result.current.upload(file);
    });
    expect(value).toEqual({
      url: "https://cdn/a3f9.pdf",
      name: "rapor.pdf",
      mime: "application/pdf",
      size: file.size,
    });
    expect(uploadFile).toHaveBeenCalledWith(file, expect.objectContaining({ accessToken: "tok" }));
  });

  it("takes any type, unlike the image flow", async () => {
    uploadFile.mockResolvedValue({ data: { url: "https://cdn/x.bin" } });
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.upload(new File(["x"], "notes.txt", { type: "text/plain" }));
    });
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("refuses a transport without uploadFile instead of using uploadImage", async () => {
    transport = { uploadImage };
    const { result } = renderHook(() => useFileUpload());
    let value;
    await act(async () => {
      value = await result.current.upload(new File(["x"], "a.pdf", { type: "application/pdf" }));
    });
    expect(value).toBeNull();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it("surfaces an error and returns null when the url is missing", async () => {
    uploadFile.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useFileUpload());
    let value;
    await act(async () => {
      value = await result.current.upload(new File(["x"], "a.pdf", { type: "application/pdf" }));
    });
    expect(value).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
