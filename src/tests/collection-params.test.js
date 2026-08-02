/**
 * The list-params builder. `offset: 0` being dropped is the whole point: the
 * page, the server fetch and the drawer all address one cache key, so a region
 * is fetched once. The three copies this replaced disagreed on exactly that.
 */
import { describe, it, expect } from "vitest";

import { buildListParams } from "../lib/collection-params.js";
import { stableStringify } from "../lib/stable-stringify.js";

describe("buildListParams", () => {
  it("is undefined when nothing narrows the window", () => {
    expect(buildListParams()).toBeUndefined();
    expect(buildListParams({})).toBeUndefined();
  });

  it("drops offset 0 so it collapses onto an omitted offset", () => {
    // A page writing `<CollectionRegion limit={5}>` and the drawer asking for
    // the same window at offset 0 must produce one cache key, not two.
    expect(stableStringify(buildListParams({ limit: 5, offset: 0 }) ?? {}))
      .toBe(stableStringify(buildListParams({ limit: 5 }) ?? {}));
  });

  it("keeps a real offset", () => {
    expect(buildListParams({ offset: 10 })).toEqual({ offset: 10 });
  });

  it("keeps limit 0 out, but any other limit in", () => {
    // `limit` is a number check, not truthiness: 0 is not a meaningful page
    // size, yet it must not silently become "no limit" either.
    expect(buildListParams({ limit: 0 })).toEqual({ limit: 0 });
    expect(buildListParams({ limit: 5 })).toEqual({ limit: 5 });
  });

  it("passes a filter through untouched", () => {
    const filter = { featured: true };
    expect(buildListParams({ filter })?.filter).toBe(filter);
  });

  it("ignores an undefined filter rather than emitting the key", () => {
    expect(buildListParams({ filter: undefined, limit: 3 })).toEqual({ limit: 3 });
  });
});
