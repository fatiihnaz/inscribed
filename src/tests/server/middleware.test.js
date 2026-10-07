import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { createCmsMiddleware } from "../../middleware.js";

const proxy = createCmsMiddleware({ locales: ["tr", "en"] });

/** @param {string} url */
function handle(url) {
  const res = proxy(new NextRequest(url));
  return {
    status: res.status,
    location: res.headers.get("location"),
    rewrite: res.headers.get("x-middleware-rewrite"),
    next: res.headers.get("x-middleware-next"),
  };
}

describe("createCmsMiddleware", () => {
  it("serves an unprefixed path from the default language", () => {
    expect(handle("https://site.test/about").rewrite).toBe("https://site.test/tr/about");
    expect(handle("https://site.test/").rewrite).toBe("https://site.test/tr");
  });

  it("passes another language's prefix through", () => {
    const out = handle("https://site.test/en/about");
    expect(out.next).toBe("1");
    expect(out.location).toBe(null);
  });

  it("redirects the default language's own prefix to the unprefixed address", () => {
    const out = handle("https://site.test/tr/about?sayfa=2");
    expect(out.status).toBe(308);
    expect(out.location).toBe("https://site.test/about?sayfa=2");
    expect(handle("https://site.test/tr").location).toBe("https://site.test/");
  });

  it("leaves a path that only starts like the default language alone", () => {
    expect(handle("https://site.test/trend").rewrite).toBe("https://site.test/tr/trend");
  });

  it("only sets the pathname header on a single-language site", () => {
    const single = createCmsMiddleware({});
    const res = single(new NextRequest("https://site.test/tr/about"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBe(null);
  });
});
