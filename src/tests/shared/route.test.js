import { describe, it, expect } from "vitest";
import { localizePath, resolveCmsRoute } from "../../shared/route.js";
import { createCmsConfig, ensureCmsConfig } from "../../shared/config.js";

/**
 * `resolveCmsRoute` decides two things a lot of the SDK then trusts: which
 * cache entry a route reads and which slug it writes to. The cases below are
 * the ones where those two answers differ.
 */

const multi = createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"] });
const single = createCmsConfig({ baseUrl: "https://api.test" });

describe("resolveCmsRoute", () => {
  it("strips a known locale prefix off the slug and keeps the pathname whole", () => {
    expect(resolveCmsRoute("/en/about", multi)).toEqual({
      pathname: "/en/about",
      slug: "/about",
      locale: "en",
    });
  });

  it("reads an unprefixed path as the default locale", () => {
    expect(resolveCmsRoute("/about", multi)).toEqual({
      pathname: "/about",
      slug: "/about",
      locale: "tr",
    });
  });

  it("gives a bare locale prefix the root slug", () => {
    expect(resolveCmsRoute("/en", multi)).toEqual({
      pathname: "/en",
      slug: "/",
      locale: "en",
    });
  });

  it("leaves an unknown prefix inside the slug", () => {
    // `/xx/about` is a page that happens to start with two letters, not a
    // locale: swallowing the segment would address a slug nobody synced.
    expect(resolveCmsRoute("/xx/about", multi)).toEqual({
      pathname: "/xx/about",
      slug: "/xx/about",
      locale: "tr",
    });
  });

  it("does not match a locale that is only a prefix of the segment", () => {
    expect(resolveCmsRoute("/en-masse", multi).slug).toBe("/en-masse");
    expect(resolveCmsRoute("/english/about", multi).slug).toBe("/english/about");
  });

  it("reports no locale at all when none are configured", () => {
    // The null is load-bearing: it is what keeps `locale` off the wire and the
    // cache tags in their pre-i18n shape for a single-language site.
    expect(resolveCmsRoute("/en/about", single)).toEqual({
      pathname: "/en/about",
      slug: "/en/about",
      locale: null,
    });
  });

  it("falls back to the root for an empty pathname", () => {
    expect(resolveCmsRoute("", multi).slug).toBe("/");
    expect(resolveCmsRoute(null, multi).slug).toBe("/");
    expect(resolveCmsRoute("/", multi)).toEqual({
      pathname: "/",
      slug: "/",
      locale: "tr",
    });
  });

  it("treats the first locale as the default", () => {
    const config = createCmsConfig({ baseUrl: "https://api.test", locales: ["de", "fr"] });
    expect(resolveCmsRoute("/about", config).locale).toBe("de");
    expect(resolveCmsRoute("/fr/about", config).locale).toBe("fr");
  });
});

describe("localizePath", () => {
  it("leaves the default locale unprefixed and prefixes the rest", () => {
    expect(localizePath("/about", "tr", multi)).toBe("/about");
    expect(localizePath("/about", "en", multi)).toBe("/en/about");
  });

  it("keeps the root a root", () => {
    // Not "/en/", which would be a second URL for the same page.
    expect(localizePath("/", "en", multi)).toBe("/en");
    expect(localizePath("/", "tr", multi)).toBe("/");
  });

  it("round-trips with resolveCmsRoute", () => {
    // The two directions have to agree, or a link would navigate somewhere the
    // reader is then told is a different page.
    for (const locale of ["tr", "en"]) {
      for (const slug of ["/", "/about", "/news/first"]) {
        const href = localizePath(slug, locale, multi);
        expect(resolveCmsRoute(href, multi)).toMatchObject({ slug, locale });
      }
    }
  });

  it("is a passthrough with no locale", () => {
    expect(localizePath("/about", null, multi)).toBe("/about");
    expect(localizePath("/about", null, single)).toBe("/about");
  });
});

describe("createCmsConfig locales", () => {
  it("leaves a single-language site with no locale dimension", () => {
    expect(single.locales).toEqual([]);
    expect(single.defaultLocale).toBeNull();
  });

  it("derives defaultLocale from the list rather than taking one", () => {
    // Order carries the meaning, on both sides of the wire: the backend picks
    // its default the same way, and a second input is a second thing to drift.
    expect(createCmsConfig({ baseUrl: "https://api.test", locales: ["en", "tr"] }).defaultLocale)
      .toBe("en");
    expect(() =>
      createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"], defaultLocale: "en" }),
    ).toThrow(/not the first entry/);
  });

  it("survives being normalized again, which is what crossing to the client is", () => {
    // `ensureCmsConfig` re-normalizes anything unfrozen, and serializing a
    // config into the RSC payload drops the freeze. So the client re-runs
    // `createCmsConfig` over an object that already carries every derived
    // field: normalizing has to be idempotent or the provider throws on mount.
    const server = createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", "en"] });
    const overTheWire = JSON.parse(JSON.stringify(server));
    expect(Object.isFrozen(overTheWire)).toBe(false);

    const client = ensureCmsConfig(overTheWire);
    expect(client).toEqual(server);
    expect(ensureCmsConfig(server)).toBe(server);
  });

  it("rejects a malformed locales list", () => {
    expect(() =>
      createCmsConfig({ baseUrl: "https://api.test", locales: ["tr", ""] }),
    ).toThrow(/non-empty strings/);
    expect(() =>
      createCmsConfig({ baseUrl: "https://api.test", locales: "tr" }),
    ).toThrow(/array/);
  });
});
