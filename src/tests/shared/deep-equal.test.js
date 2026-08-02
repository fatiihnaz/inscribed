/**
 * `deepEqual` replaced `stableStringify(a) === stableStringify(b)` on every
 * dirty-check path, so these tests pin the cases where the two must agree:
 * key order, nesting, `undefined` vs a missing key, and the type confusions a
 * naive compare gets wrong ("1" vs 1, [] vs {}).
 */
import { describe, it, expect } from "vitest";

import { deepEqual } from "../../shared/util/deep-equal.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";

/** The comparison this replaced, to assert the two stay in step. */
const viaStringify = (a, b) => stableStringify(a) === stableStringify(b);

describe("deepEqual", () => {
  const agree = [
    ["", ""],
    ["a", "b"],
    [0, 0],
    [0, "0"],
    [null, null],
    [null, undefined],
    [null, 0],
    [true, 1],
    [{ src: "a.png", alt: "x" }, { alt: "x", src: "a.png" }],
    [{ src: "a.png", alt: "x" }, { src: "a.png", alt: "y" }],
    [{ a: undefined }, {}],
    [{ a: 1 }, { a: 1, b: 2 }],
    [[], []],
    [[], {}],
    [[1, 2], [1, 2]],
    [[1, 2], [2, 1]],
    [[1, 2], [1, 2, 3]],
    [[{ a: [1, { b: 2 }] }], [{ a: [1, { b: 2 }] }]],
    [[{ a: [1, { b: 2 }] }], [{ a: [1, { b: 3 }] }]],
    [{ items: [] }, { items: [] }],
  ];

  it.each(agree)("matches stableStringify for %j vs %j", (a, b) => {
    expect(deepEqual(a, b)).toBe(viaStringify(a, b));
  });

  it("short-circuits on reference equality", () => {
    const value = { deeply: { nested: [1, 2, 3] } };
    expect(deepEqual(value, value)).toBe(true);
  });

  it("compares long strings without serialising them", () => {
    const html = `<p>${"x".repeat(10_000)}</p>`;
    expect(deepEqual(html, html)).toBe(true);
    expect(deepEqual(html, `${html} `)).toBe(false);
  });
});
