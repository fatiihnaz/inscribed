/**
 * Tests for `safeHref`: the one gate between a stored address and an `href`,
 * on the page and in the admin panel alike.
 */
import { describe, it, expect } from "vitest";

import { safeHref } from "../../shared/util/url.js";

describe("safeHref", () => {
  it("passes web, mail, phone, relative and anchor addresses through trimmed", () => {
    expect(safeHref("https://intranet.sirket.com.tr/a.pdf")).toBe("https://intranet.sirket.com.tr/a.pdf");
    expect(safeHref("  http://example.com  ")).toBe("http://example.com");
    expect(safeHref("mailto:bilgi@sirket.com")).toBe("mailto:bilgi@sirket.com");
    expect(safeHref("tel:+905551112233")).toBe("tel:+905551112233");
    expect(safeHref("/belgeler/a.pdf")).toBe("/belgeler/a.pdf");
    expect(safeHref("#iletisim")).toBe("#iletisim");
    expect(safeHref("../a.pdf")).toBe("../a.pdf");
  });

  it("turns script-running schemes into an inert empty string", () => {
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("  JavaScript:alert(1)")).toBe("");
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeHref("vbscript:msgbox(1)")).toBe("");
  });

  it("returns an empty string for anything that is not a string", () => {
    expect(safeHref(null)).toBe("");
    expect(safeHref(undefined)).toBe("");
    expect(safeHref({ href: "https://x" })).toBe("");
  });
});
