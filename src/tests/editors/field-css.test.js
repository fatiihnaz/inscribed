import { describe, it, expect } from "vitest";
import { fieldCss } from "../../editors/field-css.js";

// Same guard `panelCss` carries: a backtick inside a CSS comment closes the
// template literal early, so the rest of the sheet parses as JavaScript. It
// has happened once in each sheet already.
describe("fieldCss template literal integrity", () => {
  it("evaluates to one continuous CSS string", () => {
    expect(typeof fieldCss).toBe("string");
    expect(fieldCss.length).toBeGreaterThan(500);
  });

  it("carries the rules at both ends of the sheet", () => {
    expect(fieldCss).toContain(".inscribed-neutral");
    expect(fieldCss).toContain(".inscribed-collection");
    expect(fieldCss).toContain(".inscribed-clock:focus-within");
  });

  it("leaves no stray backticks that could reopen the literal", () => {
    expect(fieldCss).not.toContain("`");
  });

  it("routes every accent through the context variable, never the raw token", () => {
    // The raw token is legitimate as the variable's fallback, so the test is
    // that it never appears *without* it: an accent reached directly would
    // ignore a collection surface's override, which is the whole point.
    const accentMixes = fieldCss.match(/color-mix\([^;]*?--ins-accent[^;]*?\)/g) ?? [];
    expect(accentMixes.length).toBeGreaterThan(0);
    for (const mix of accentMixes) expect(mix).toContain("--ins-f-accent");
  });
});
