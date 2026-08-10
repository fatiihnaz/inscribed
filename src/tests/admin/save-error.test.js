/**
 * The banner's wording per failure kind. The two 409s are the point: one names
 * blocks and hands the decision to the cards below, the other is a bare write
 * race with nothing block-level to reconcile.
 */
import { describe, it, expect } from "vitest";

import { describeSaveError } from "../../admin/save-error.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
// A real translator, in Turkish, so the assertions below keep reading against
// the wording they were written for while the panel default is English.
import { createTranslator, resolveStrings } from "../../shared/i18n/translate.js";

/** @param {number} status @param {*} [extra] */
const apiError = (status, extra = {}) =>
  new CmsApiError({ status, detail: "boom", ...extra });

const t = createTranslator(resolveStrings("tr"), "tr");

describe("describeSaveError", () => {
  it("returns null when there is nothing to show", () => {
    expect(describeSaveError(null, t)).toBe(null);
    expect(describeSaveError(undefined, t)).toBe(null);
  });

  const twoBlockConflict = () => apiError(409, {
    conflicts: [
      { path: "hero.title", expected: 4, provided: 1 },
      { path: "cover", expected: 2, provided: 1 },
    ],
  });

  it("counts the blocks still unresolved, not the ones the save was refused over", () => {
    expect(describeSaveError(twoBlockConflict(), t, 2).text).toContain("2 blok");
    // One resolved: the banner follows the flags rather than the stale error.
    expect(describeSaveError(twoBlockConflict(), t, 1).text).toContain("1 blok");
  });

  it("goes quiet once the last flagged block is resolved", () => {
    expect(describeSaveError(twoBlockConflict(), t, 0)).toBe(null);
  });

  it("asks for a retry when the 409 carries no conflicts", () => {
    const out = describeSaveError(apiError(409), t);
    expect(out.tone).toBe("conflict");
    // No block count: there is nothing marked on the cards to send them to.
    expect(out.text).not.toMatch(/\d+ blok/);
  });

  it("treats an empty conflicts array as a write race too", () => {
    const out = describeSaveError(apiError(409, { conflicts: [] }), t);
    expect(out.text).not.toMatch(/\d+ blok/);
  });

  it("keeps a write race on screen: it flags nothing, so nothing can resolve it", () => {
    expect(describeSaveError(apiError(409), t, 0)).not.toBe(null);
  });

  it("keeps the forbidden and generic cases", () => {
    expect(describeSaveError(apiError(403), t).tone).toBe("forbidden");
    expect(describeSaveError(apiError(500), t).tone).toBe("error");
    expect(describeSaveError(new Error("ağ hatası"), t)).toEqual({
      tone: "error",
      text: "ağ hatası",
    });
  });
});
