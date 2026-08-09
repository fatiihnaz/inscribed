/**
 * The gate in front of the translation prompt. It decides how often an editor
 * gets interrupted, so the two failure modes are symmetrical and both bad:
 * firing on a typo trains people to dismiss it, staying quiet on a rewrite
 * means the other languages silently drift.
 */
import { describe, it, expect } from "vitest";

import {
  isSubstantialChange,
  TRANSLATION_MIN_CHANGED_WORDS,
} from "../../admin/translation-scope.js";

describe("isSubstantialChange", () => {
  it("stays quiet on types whose value is not prose", () => {
    // "Translate this" means nothing for a date or an image, and a Link's href
    // is not language at all.
    expect(isSubstantialChange("Date", "2024-01-01", "2026-08-05")).toBe(false);
    expect(isSubstantialChange("Image", { src: "/a.png" }, { src: "/b.png" })).toBe(false);
    expect(isSubstantialChange("Link", { href: "/a" }, { href: "/bambaşka-bir-yer" })).toBe(false);
    // A List's fields would each need their own answer, so the block-level
    // question has none.
    expect(isSubstantialChange("List", [{ t: "a" }], [{ t: "bir iki üç dört beş" }])).toBe(false);
  });

  it("stays quiet on a typo fix", () => {
    expect(isSubstantialChange(
      "LongText",
      "Bu satırda ufak bir yazm hatası var",
      "Bu satırda ufak bir yazım hatası var",
    )).toBe(false);
  });

  it("stays quiet when nothing changed", () => {
    expect(isSubstantialChange("ShortText", "Aynı metin", "Aynı metin")).toBe(false);
  });

  it("fires once enough words have been rewritten", () => {
    const added = Array.from({ length: TRANSLATION_MIN_CHANGED_WORDS }, (_, i) => `kelime${i}`);
    expect(isSubstantialChange("LongText", "Sabit gövde", `Sabit gövde ${added.join(" ")}`))
      .toBe(true);
  });

  it("holds its fire one word below the threshold", () => {
    const added = Array.from({ length: TRANSLATION_MIN_CHANGED_WORDS - 1 }, (_, i) => `k${i}`);
    expect(isSubstantialChange("LongText", "Sabit gövde", `Sabit gövde ${added.join(" ")}`))
      .toBe(false);
  });

  it("counts removals, not only additions", () => {
    // Deleting a sentence leaves the other languages just as wrong as adding one.
    const long = "bir iki üç dört beş altı yedi sekiz";
    expect(isSubstantialChange("LongText", long, "bir iki")).toBe(true);
  });

  it("reads RichText through its text, not its markup", () => {
    // Bolding a word rewrites the string without changing a syllable of what
    // the other languages would have to say.
    expect(isSubstantialChange(
      "RichText",
      "<p>Bir iki üç dört beş altı</p>",
      "<p>Bir <strong>iki</strong> üç <em>dört</em> beş altı</p>",
    )).toBe(false);

    expect(isSubstantialChange(
      "RichText",
      "<p>Bir iki üç dört beş altı</p>",
      "<p>Tamamen başka bir cümle yazdık buraya</p>",
    )).toBe(true);
  });

  it("treats filling an empty block as substantial", () => {
    expect(isSubstantialChange("LongText", "", "bir iki üç dört")).toBe(true);
    expect(isSubstantialChange("LongText", null, "bir iki")).toBe(false);
  });
});
