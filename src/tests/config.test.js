import { describe, it, expect } from "vitest";
import { createCmsConfig } from "../lib/config.js";

describe("createCmsConfig", () => {
  it("requires a string baseUrl", () => {
    expect(() => createCmsConfig({})).toThrow(/baseUrl is required/);
    expect(() => createCmsConfig({ baseUrl: "" })).toThrow(/baseUrl is required/);
    // @ts-expect-error - intentional wrong type
    expect(() => createCmsConfig({ baseUrl: 123 })).toThrow(/baseUrl is required/);
  });

  it("strips trailing slashes from baseUrl and cdnUrl", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test//", cdnUrl: "https://cdn.test/" });
    expect(cfg.baseUrl).toBe("https://api.test");
    expect(cfg.cdnUrl).toBe("https://cdn.test");
  });

  it("defaults cdnUrl to null", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(cfg.cdnUrl).toBeNull();
  });

  it("defaults globalSlug to __global and honours an override", () => {
    expect(createCmsConfig({ baseUrl: "https://api.test" }).globalSlug).toBe("__global");
    expect(
      createCmsConfig({ baseUrl: "https://api.test", globalSlug: "site" }).globalSlug,
    ).toBe("site");
  });

  it("returns a frozen object (safe to pass across the RSC boundary)", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it("does not embed a transport (non-serializable) on the config", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(cfg.transport).toBeUndefined();
  });

  it("defaults theme to null when not supplied", () => {
    expect(createCmsConfig({ baseUrl: "https://api.test" }).theme).toBeNull();
  });

  it("keeps only known theme keys and drops the rest", () => {
    const cfg = createCmsConfig({
      baseUrl: "https://api.test",
      theme: { accent: "#3b82f6", radius: 8, bogus: "nope" },
    });
    expect(cfg.theme).toEqual({ accent: "#3b82f6", radius: 8 });
  });

  it("treats an all-unknown / empty theme as null", () => {
    expect(
      createCmsConfig({ baseUrl: "https://api.test", theme: { bogus: "x" } }).theme,
    ).toBeNull();
    expect(createCmsConfig({ baseUrl: "https://api.test", theme: {} }).theme).toBeNull();
  });

  it("rejects non-string/number theme values", () => {
    expect(() =>
      // @ts-expect-error - intentional wrong type
      createCmsConfig({ baseUrl: "https://api.test", theme: { accent: {} } }),
    ).toThrow(/theme\.accent must be a string or number/);
  });
});