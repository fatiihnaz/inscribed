// @vitest-environment jsdom
/**
 * Tests for `FileEditor`'s two ways in. useFileUpload is mocked (its contract is
 * covered separately), so these assert what a typed address changes: the box is
 * there on an empty field, typing over an upload drops the type and size that
 * described it, the row names the server when nothing else is known, and an
 * address that would run script gets no open link.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../editors/use-file-upload.js", () => ({
  useFileUpload: () => ({
    upload: vi.fn(),
    reset: () => {},
    isUploading: false,
    progress: 0,
    error: null,
  }),
}));

// An empty config resolves the panel wording to the English catalog.
vi.mock("../../shared/state/cms-context.js", () => ({
  useCmsContext: () => ({ config: {} }),
}));

import { FileEditor } from "../../editors/fields/FileEditor.jsx";
import { en } from "../../shared/i18n/en/index.js";

const URL_LABEL = en["editors.file.url"];
const NAME_LABEL = en["editors.file.name"];
const OPEN = en["editors.file.open"];
const REMOVE = en["editors.file.remove"];

const uploaded = { url: "https://cdn.sirket.com/a3f9.pdf", name: "2026 Raporu", mime: "application/pdf", size: 2517000 };
const typed = { url: "https://intranet.sirket.com.tr/belgeler/rapor.pdf", name: "Rapor", mime: "", size: null };

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("FileEditor", () => {
  it("offers the address and title boxes on an empty field", () => {
    render(<FileEditor value={null} onChange={() => {}} />);
    expect(screen.getByLabelText(URL_LABEL)).toBeTruthy();
    expect(screen.getByLabelText(NAME_LABEL)).toBeTruthy();
  });

  it("drops the type and size when the address is typed over", () => {
    const onChange = vi.fn();
    render(<FileEditor value={uploaded} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(URL_LABEL), { target: { value: typed.url } });
    expect(onChange).toHaveBeenCalledWith({ url: typed.url, name: "2026 Raporu", mime: "", size: null });
  });

  it("keeps the type and size when only the title changes", () => {
    const onChange = vi.fn();
    render(<FileEditor value={uploaded} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(NAME_LABEL), { target: { value: "Yıllık rapor" } });
    expect(onChange).toHaveBeenCalledWith({ ...uploaded, name: "Yıllık rapor" });
  });

  it("describes an upload by format and size, a typed address by its server", () => {
    const { rerender } = render(<FileEditor value={uploaded} onChange={() => {}} />);
    expect(screen.getByText("PDF · 2.4 MB")).toBeTruthy();
    rerender(<FileEditor value={typed} onChange={() => {}} />);
    expect(screen.getByText("intranet.sirket.com.tr")).toBeTruthy();
  });

  it("links to a web address but gives a script address no open link", () => {
    const { rerender } = render(<FileEditor value={typed} onChange={() => {}} />);
    expect(screen.getByText(OPEN).closest("a")?.getAttribute("href")).toBe(typed.url);
    rerender(<FileEditor value={{ ...typed, url: "javascript:alert(1)" }} onChange={() => {}} />);
    expect(screen.queryByText(OPEN)).toBeNull();
  });

  it("clears to the empty value, size unknown rather than zero", () => {
    const onChange = vi.fn();
    render(<FileEditor value={uploaded} onChange={onChange} />);
    fireEvent.click(screen.getByText(REMOVE));
    expect(onChange).toHaveBeenCalledWith({ url: "", name: "", mime: "", size: null });
  });
});
