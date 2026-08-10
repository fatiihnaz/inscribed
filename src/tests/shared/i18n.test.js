/**
 * The panel's own wording.
 *
 * Two things can rot here and neither shows up at runtime as an error: a
 * catalog drifting behind English, and a language nobody wrote a catalog for
 * silently losing its plural rule. Both are pinned below.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { en } from "../../shared/i18n/en/index.js";
import { tr } from "../../shared/i18n/tr/index.js";
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

afterEach(() => { vi.restoreAllMocks(); });

/** Counted keys carry `_one`/`_other`; compare on the stem. */
const stems = (catalog) => new Set(
  Object.keys(catalog).map((k) => k.replace(/_(one|other|two|few|many|zero)$/, "")),
);

describe("catalogs", () => {
  it("cover the same things in both languages", () => {
    // Not key-for-key: Turkish takes one form after a number, so it carries
    // `_other` where English carries both. What has to match is the set of
    // things sayable.
    expect([...stems(tr)].sort()).toEqual([...stems(en)].sort());
  });

  it("keeps every placeholder English promises", () => {
    const placeholders = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
    for (const [key, text] of Object.entries(tr)) {
      const source = en[key] ?? en[key.replace(/_other$/, "_one")] ?? en[key.replace(/_other$/, "")];
      if (!source) continue;
      // A translation that dropped `{count}` renders a sentence missing its
      // number, which reads as finished text and is easy to miss in review.
      expect(placeholders(text), key).toBe(placeholders(source));
    }
  });
});

describe("resolveStrings", () => {
  it("falls back to English per key, not per catalog", () => {
    const strings = resolveStrings("tr", { "status.save": "Yolla" });
    expect(strings["status.save"]).toBe("Yolla");
    expect(strings["status.discard"]).toBe(tr["status.discard"]);
    // Neither the override nor Turkish has it, so English answers.
    expect(strings["changes.empty"]).toBe(tr["changes.empty"]);
  });

  it("takes a language it has never heard of", () => {
    // The point of `adminStrings`: a locale with no built-in catalog is a
    // first-class case, not an error.
    const strings = resolveStrings("de", { "status.save": "Speichern" });
    expect(strings["status.save"]).toBe("Speichern");
    expect(strings["status.discard"]).toBe(en["status.discard"]);
  });

  it("defaults to English", () => {
    expect(resolveStrings()["status.save"]).toBe("Save");
  });
});

describe("createTranslator", () => {
  const t = (locale, overrides) => createTranslator(resolveStrings(locale, overrides), locale);

  it("interpolates", () => {
    expect(t("en")("changes.openCollection", { key: "news" }))
      .toBe("Open the news collection");
  });

  it("leaves an unknown placeholder visible", () => {
    // Deleting it would make a typo look like finished copy.
    expect(t("en", { "x.y": "{a} and {b}" })("x.y", { a: "1" })).toBe("1 and {b}");
  });

  it("picks the plural form the language actually uses", () => {
    expect(t("en")("status.unsaved", { count: 1 })).toBe("1 unsaved change");
    expect(t("en")("status.unsaved", { count: 3 })).toBe("3 unsaved changes");
    // Turkish has one form after a number, and says so by carrying only
    // `_other`.
    expect(t("tr")("status.unsaved", { count: 1 })).toBe("1 kaydedilmemiş değişiklik");
  });

  it("still renders under a locale Intl cannot parse", () => {
    // A bad tag throws out of `Intl.PluralRules`, and no plural forms beats no
    // panel.
    expect(t("not a tag")("status.unsaved", { count: 2 })).toBe("2 unsaved changes");
  });

  it("shows the key when nothing answers, and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const translate = t("en");
    // A blank button is a mystery; the key names the thing to go fix.
    expect(translate("nope.nope")).toBe("nope.nope");
    expect(translate("nope.nope")).toBe("nope.nope");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
