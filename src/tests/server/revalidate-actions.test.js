/**
 * The publish actions mark their tags stale with the `"max"` profile. An
 * immediate expiry (`updateTag`, or `revalidateTag` with one argument) makes
 * Next 16 answer every prerendered page of the language with a 404 when its
 * layout sets `dynamicParams = false`, as the localization setup does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cache = vi.hoisted(() => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => cache);

import { revalidateCmsCollection, revalidateCmsSlug } from "../../server/actions.js";
import { cmsCacheTag, cmsCollectionItemTag, cmsCollectionTag, cmsSiteTag } from "../../server/get-content.js";

beforeEach(() => {
  cache.updateTag.mockClear();
  cache.revalidateTag.mockClear();
});

describe("publish actions", () => {
  it("marks the page's tag and its language's site tag stale", async () => {
    await revalidateCmsSlug("/about", "en");

    expect(cache.revalidateTag.mock.calls).toEqual([
      [cmsCacheTag("/about", "en"), "max"],
      [cmsSiteTag("en"), "max"],
    ]);
    expect(cache.updateTag).not.toHaveBeenCalled();
  });

  it("marks the collection stale, and the record when one is named", async () => {
    await revalidateCmsCollection("news", "bahar");

    expect(cache.revalidateTag.mock.calls).toEqual([
      [cmsCollectionTag("news"), "max"],
      [cmsCollectionItemTag("news", "bahar"), "max"],
    ]);
    expect(cache.updateTag).not.toHaveBeenCalled();
  });
});
