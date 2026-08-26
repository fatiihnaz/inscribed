import { describe, it, expect } from "vitest";
import { choiceSlug, choiceLabel } from "../../shared/util/choice-value.js";
import { buildPayload, requiredMissing } from "../../collections/record-payload.js";

/**
 * @file A reference field reads its label and writes its slug.
 *
 * The backend sends the same { slug, label } pair a lookup returns, so the
 * editor can name the record it holds without asking for it. Only the slug goes
 * back: the label is the backend's to resolve, and echoing one would let what
 * is displayed drift from what is stored.
 */

const field = (type, extra = {}) => ({
  name: "f", label: "Alan", type, required: false,
  readOnly: false, computed: false, source: null, itemFields: null, ...extra,
});

describe("reading a reference value", () => {
  it("prefers the label and falls back to the slug", () => {
    expect(choiceLabel({ slug: "ada", label: "Ada Lovelace" })).toBe("Ada Lovelace");
    expect(choiceLabel({ slug: "ada" })).toBe("ada");
    expect(choiceLabel("ada")).toBe("ada");
  });

  // Someone wiring their own backend should see a slug on screen while the
  // label side is still missing, not a crash.
  it("survives a pair with an empty label", () => {
    expect(choiceLabel({ slug: "ada", label: "" })).toBe("ada");
    expect(choiceSlug({ slug: "ada", label: "" })).toBe("ada");
  });
});

describe("writing a reference value", () => {
  it("sends the slug, never the pair", () => {
    const out = buildPayload([field("Select")], { f: { slug: "ada", label: "Ada" } });
    expect(out.f).toBe("ada");
  });

  it("sends slugs for a list of pairs", () => {
    const out = buildPayload([field("StringArray")], {
      f: [{ slug: "ada", label: "Ada" }, "cem"],
    });
    expect(out.f).toEqual(["ada", "cem"]);
  });

  it("counts a pair as present when the field is required", () => {
    const f = [field("Select", { required: true })];
    expect(requiredMissing(f, { f: { slug: "ada", label: "Ada" } })).toBeNull();
    expect(requiredMissing(f, { f: { slug: "", label: "" } })).toBe("Alan");
  });
});
