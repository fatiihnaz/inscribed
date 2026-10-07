import { describe, it, expect } from "vitest";

import { absoluteUrl, fillSlug, seedIn, textOf } from "../../shared/seo.js";

describe("textOf", () => {
  it("reduces rich text to its words", () => {
    expect(textOf("<p>Tom &amp; Jerry&nbsp;<strong>live</strong></p><p>here</p>")).toBe("Tom & Jerry live here");
  });

  it("leaves plain text alone apart from its whitespace", () => {
    expect(textOf("  a < b\n and c  ")).toBe("a < b and c");
    expect(textOf(null)).toBe("");
  });
});

describe("seedIn", () => {
  const locales = ["tr", "en"];

  it("reads a per-language map, a missing language taking the default's value", () => {
    expect(seedIn({ tr: "Merhaba", en: "Hello" }, "en", locales)).toBe("Hello");
    expect(seedIn({ tr: "Merhaba" }, "en", locales)).toBe("Merhaba");
  });

  it("keeps an object whose keys are not languages as the value", () => {
    expect(seedIn({ src: "/a.png", alt: "" }, "en", locales)).toEqual({ src: "/a.png", alt: "" });
  });
});

describe("fillSlug", () => {
  it("puts params into a template", () => {
    expect(fillSlug("/news/[id]", { id: "5" })).toBe("/news/5");
    expect(fillSlug("/docs/[...path]", { path: ["a", "b c"] })).toBe("/docs/a/b%20c");
  });

  it("drops an empty optional catch-all and keeps a static slug as it is", () => {
    expect(fillSlug("/docs/[[...path]]", {})).toBe("/docs");
    expect(fillSlug("/", {})).toBe("/");
    expect(fillSlug("/about", { locale: "en" })).toBe("/about");
  });
});

describe("absoluteUrl", () => {
  it("joins onto the site's origin, the root being the origin itself", () => {
    expect(absoluteUrl("/en/about", "https://site.test")).toBe("https://site.test/en/about");
    expect(absoluteUrl("/", "https://site.test")).toBe("https://site.test");
    expect(absoluteUrl("/about", null)).toBe("/about");
  });
});
