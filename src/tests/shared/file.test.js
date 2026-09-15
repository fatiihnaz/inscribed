/**
 * Tests for the `File` field's display helpers: what the drawer row and the
 * changes panel both say about a file.
 */
import { describe, it, expect } from "vitest";

import { formatBytes, fileKindLabel, fileMeta } from "../../shared/util/file.js";

describe("formatBytes", () => {
  it("drops the decimal below a kilobyte and past three digits", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2517000)).toBe("2.4 MB");
    expect(formatBytes(257 * 1024 * 1024)).toBe("257 MB");
  });

  it("returns null for anything that is not a usable count", () => {
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(NaN)).toBeNull();
    expect(formatBytes(/** @type {*} */ ("2517000"))).toBeNull();
    expect(formatBytes(/** @type {*} */ (undefined))).toBeNull();
  });
});

describe("fileKindLabel", () => {
  it("names the format rather than the registry string", () => {
    expect(fileKindLabel("application/pdf")).toBe("PDF");
    expect(fileKindLabel(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )).toBe("DOCX");
    expect(fileKindLabel("image/svg+xml")).toBe("SVG");
    expect(fileKindLabel("application/x-tar")).toBe("TAR");
    expect(fileKindLabel("image/png; charset=binary")).toBe("PNG");
  });

  it("returns null for the empty type a browser reports on an unknown extension", () => {
    expect(fileKindLabel("")).toBeNull();
    expect(fileKindLabel(/** @type {*} */ (undefined))).toBeNull();
  });
});

describe("fileMeta", () => {
  it("describes an upload by its format and size", () => {
    expect(fileMeta({ url: "https://cdn/a3f9.pdf", mime: "application/pdf", size: 2517000 }))
      .toBe("PDF · 2.4 MB");
    // An extension the browser did not know still has a size worth showing.
    expect(fileMeta({ url: "https://cdn/a3f9", mime: "", size: 2048 })).toBe("2.0 KB");
  });

  it("names the server for a typed address, which carries neither", () => {
    expect(fileMeta({ url: "https://intranet.sirket.com.tr/belgeler/a.pdf", mime: "", size: null }))
      .toBe("intranet.sirket.com.tr");
    expect(fileMeta({ url: "https://www.youtube.com/watch?v=abc", mime: "", size: null }))
      .toBe("www.youtube.com");
  });

  it("says nothing for a relative or unparseable address", () => {
    expect(fileMeta({ url: "/belgeler/a.pdf", mime: "", size: null })).toBeNull();
    expect(fileMeta({ url: "intranet", mime: "", size: null })).toBeNull();
  });
});
