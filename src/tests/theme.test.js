import { describe, it, expect } from "vitest";
import { normalizeTheme, buildThemeCss } from "../lib/theme.js";

describe("normalizeTheme", () => {
  it("returns null for nullish / non-object input", () => {
    expect(normalizeTheme(null)).toBeNull();
    expect(normalizeTheme(undefined)).toBeNull();
    // @ts-expect-error - intentional wrong type
    expect(normalizeTheme("nope")).toBeNull();
  });

  it("keeps known keys and drops unknown / empty ones", () => {
    expect(
      normalizeTheme({ accent: "#fff", radius: 8, bogus: "x", danger: "" }),
    ).toEqual({ accent: "#fff", radius: 8 });
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(normalizeTheme({ accent: "#fff" }))).toBe(true);
  });

  it("throws on non-string/number values", () => {
    // @ts-expect-error - intentional wrong type
    expect(() => normalizeTheme({ accent: {} })).toThrow(/accent/);
  });
});

describe("buildThemeCss", () => {
  it("returns an empty string when there is nothing to emit", () => {
    expect(buildThemeCss(null)).toBe("");
    expect(buildThemeCss({})).toBe("");
    expect(buildThemeCss({ bogus: "x" })).toBe("");
  });

  it("maps public keys to --ins-* custom properties", () => {
    const css = buildThemeCss({ accent: "#3b82f6", fontSans: "Geist" });
    expect(css).toContain("--ins-accent:#3b82f6;");
    expect(css).toContain("--ins-font-sans:Geist;");
    expect(css.startsWith(":root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
  });

  it("emits numeric radius as px", () => {
    expect(buildThemeCss({ radius: 8 })).toContain("--ins-radius:8px;");
  });

  it("passes a string radius through unchanged", () => {
    expect(buildThemeCss({ radius: "0.5rem" })).toContain("--ins-radius:0.5rem;");
  });
});
