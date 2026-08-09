/**
 * Draft-queue lane keys. The queue's whole job is keeping two writers off one
 * backend slot, so these keys deciding "same slot" or "different slot" is the
 * behaviour: a key that collides makes one edit cancel another's in-flight
 * write, and a key that splits when it shouldn't lets two writers race.
 */
import { describe, it, expect } from "vitest";

import {
  contentDraftKey, itemDraftKey, newDraftKey,
  translationDraftKey, parseTranslationDraftKey,
} from "../../shared/state/draft-keys.js";

describe("contentDraftKey", () => {
  it("gives each language of a page its own lane", () => {
    // Editing the English copy must not cancel the Turkish write still on the
    // wire: they are two draft slots on the backend, so two lanes here.
    expect(contentDraftKey("/about", "en")).not.toBe(contentDraftKey("/about", "tr"));
  });

  it("keeps one lane per slug within a language", () => {
    expect(contentDraftKey("/about", "en")).toBe(contentDraftKey("/about", "en"));
    expect(contentDraftKey("/about", "en")).not.toBe(contentDraftKey("/team", "en"));
  });

  it("keeps the pre-i18n key on a single-language site", () => {
    expect(contentDraftKey("/about")).toBe("content:/about");
    expect(contentDraftKey("/about", null)).toBe("content:/about");
  });
});

describe("newDraftKey", () => {
  it("gives each language its own new-item slot", () => {
    // Composing a Turkish record and an English one are two drafts on the
    // backend; sharing a lane would make one overwrite the other.
    expect(newDraftKey("news", "en")).not.toBe(newDraftKey("news", "tr"));
  });

  it("still shares one slot per collection within a language", () => {
    // The virtual row's editor and an open composer both POST to the same
    // endpoint, so they must land in the same lane rather than race.
    expect(newDraftKey("news", "en")).toBe(newDraftKey("news", "en"));
    expect(newDraftKey("news", "en")).not.toBe(newDraftKey("teams", "en"));
  });

  it("keeps the pre-i18n key on a single-language site", () => {
    expect(newDraftKey("news")).toBe("new:news");
  });
});

describe("itemDraftKey", () => {
  it("takes no locale, because a slug already names one row", () => {
    // Slugs are unique across the whole collection, translations included, so
    // a record and its translation are two slugs and already two lanes.
    expect(itemDraftKey("news", "yeni-urun")).not.toBe(itemDraftKey("news", "new-product"));
  });
});

describe("translationDraftKey", () => {
  it("round-trips a pathname holding the delimiter's plausible rivals", () => {
    // Both halves are user-shaped: a pathname can carry a colon, a blockPath
    // carries dots and brackets. Whatever separates them has to be a character
    // neither side can produce.
    const key = translationDraftKey("/en/a:b", "hero.items[0].title");
    expect(parseTranslationDraftKey(key)).toEqual({
      pathname: "/en/a:b",
      blockPath: "hero.items[0].title",
    });
  });

  it("keeps one blockPath's languages apart", () => {
    expect(translationDraftKey("/en/about", "hero.title"))
      .not.toBe(translationDraftKey("/de/about", "hero.title"));
  });

  it("keeps the same blockPath on two pages apart", () => {
    // Navigating from /a to /b must not hand /a's half-typed translation to /b.
    expect(translationDraftKey("/en/a", "hero.title"))
      .not.toBe(translationDraftKey("/en/b", "hero.title"));
  });

  it("reports a key it did not write", () => {
    expect(parseTranslationDraftKey("hero.title")).toBeNull();
  });
});

describe("namespaces", () => {
  it("keeps content, item and new-item lanes apart", () => {
    const keys = [
      contentDraftKey("news", "en"),
      itemDraftKey("news", "en"),
      newDraftKey("news", "en"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
