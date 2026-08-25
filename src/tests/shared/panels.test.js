/**
 * `normalizePanels` is the wiring-time gate for `createCmsPage({ panels })` and
 * `<CmsProvider panels>`. Everything it refuses would otherwise surface much
 * later as a rail button that opens nothing, or two areas fighting over one id.
 */
import { describe, it, expect } from "vitest";

import { normalizePanels } from "../../shared/panels.js";

const Component = () => null;
const panel = (over) => ({ id: "orders", label: "Orders", Component, ...over });

describe("normalizePanels", () => {
  it("treats absent and empty alike, so 'no panels' is one check downstream", () => {
    expect(normalizePanels(undefined)).toBeNull();
    expect(normalizePanels(null)).toBeNull();
    expect(normalizePanels([])).toBeNull();
  });

  it("freezes what it hands back, so a later push can't change the rail", () => {
    const panels = normalizePanels([panel()]);
    expect(Object.isFrozen(panels)).toBe(true);
    expect(panels).toHaveLength(1);
  });

  it("accepts labelKey in place of label", () => {
    expect(normalizePanels([panel({ label: undefined, labelKey: "panels.orders" })]))
      .toHaveLength(1);
  });

  it("refuses the drawer's own area names, which are also its mode values", () => {
    for (const id of ["page", "collections"]) {
      expect(() => normalizePanels([panel({ id })])).toThrow(/drawer's own areas/);
    }
  });

  it("refuses a duplicate id, naming the index that repeats it", () => {
    expect(() => normalizePanels([panel(), panel()])).toThrow(/panels\[1\].*duplicate/);
  });

  it("requires an id and a Component", () => {
    expect(() => normalizePanels([panel({ id: "" })])).toThrow(/`id` is required/);
    expect(() => normalizePanels([panel({ Component: undefined })])).toThrow(/`Component` is required/);
  });

  it("requires exactly one of label / labelKey", () => {
    expect(() => normalizePanels([panel({ label: undefined })]))
      .toThrow(/exactly one/);
    expect(() => normalizePanels([panel({ labelKey: "panels.orders" })]))
      .toThrow(/exactly one/);
  });

  it("refuses a non-array, which is the likely shape of a single-panel typo", () => {
    expect(() => normalizePanels(panel())).toThrow(/must be an array/);
  });
});
