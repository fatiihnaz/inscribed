/**
 * Guards the one rule the page-side chrome cannot break: entering admin mode
 * must not reflow the page. Every affordance (ring, tint, chip) is painted
 * outside the content box, so the styles here may never contribute a padding or
 * margin. They did once, and a block-level region grew 16px taller the moment
 * an admin loaded the page.
 */
import { describe, it, expect } from "vitest";

import {
  regionBoxStyle,
  regionChipStyle,
  regionActionsStyle,
  haloInset,
} from "../../core/page-region-chrome.js";
import { ROOMY_INSET } from "../../shared/style/tokens.js";

const LAYOUT_PROPS = [
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "width", "height", "border", "borderWidth",
];

/** Every ring state a region can be in. */
const STATES = [];
for (const roomy of [true, false]) {
  for (const highlight of [true, false]) {
    for (const hovered of [true, false]) {
      STATES.push({ roomy, highlight, hovered });
    }
  }
}

describe("regionBoxStyle", () => {
  it("never contributes a layout box", () => {
    for (const state of STATES) {
      const style = regionBoxStyle({ display: "block", accent: "#fff", ...state });
      for (const prop of LAYOUT_PROPS) {
        expect(style[prop], `${prop} in ${JSON.stringify(state)}`).toBeUndefined();
      }
    }
  });

  it("reaches outward through the outline offset, not padding", () => {
    const roomy = regionBoxStyle({
      display: "block", roomy: true, highlight: false, hovered: true, accent: "#fff",
    });
    expect(roomy.outlineOffset).toBe(ROOMY_INSET);

    const tight = regionBoxStyle({
      display: "inline-block", roomy: false, highlight: false, hovered: true, accent: "#fff",
    });
    expect(tight.outlineOffset).toBe(haloInset(false));
    expect(tight.outlineOffset).toBeLessThan(ROOMY_INSET);
  });

  it("keeps the ring in place while idle, so only its colour animates", () => {
    const idle = regionBoxStyle({
      display: "block", roomy: true, highlight: false, hovered: false, accent: "#fff",
    });
    expect(idle.outline).toContain("transparent");
    expect(idle.boxShadow).toBe("none");
    expect(idle.backgroundColor).toBe("transparent");
  });
});

describe("floating rows", () => {
  // The chip and the actions row are children of the region, so hover survives
  // the pointer's trip onto them only while row and content box touch.
  it("anchor flush against the content box", () => {
    const chip = regionChipStyle({ roomy: false, highlight: false, accent: "#fff" });
    expect(chip.top).toBe(0);
    expect(chip.transform).toBe("translateY(-100%)");

    const roomyChip = regionChipStyle({ roomy: true, highlight: false, accent: "#fff" });
    expect(roomyChip.top).toBe(-ROOMY_INSET);
    expect(roomyChip.transform).toBe("translateY(-50%)");

    expect(regionActionsStyle({ roomy: true }).top).toBe(-ROOMY_INSET);
    expect(regionActionsStyle({ roomy: false }).top).toBe(0);
  });

  // An image's halo stays tight, but its chip still rides the ring line: the
  // two came from one `roomy` flag once, which left every image's chip floating
  // above a line that ran underneath it.
  it("straddles a tight ring when asked, on the tight inset", () => {
    const onImage = regionChipStyle({
      roomy: false, straddle: true, highlight: false, accent: "#fff",
    });
    expect(onImage.top).toBe(-haloInset(false));
    expect(onImage.transform).toBe("translateY(-50%)");
    expect(haloInset(false)).toBeLessThan(ROOMY_INSET);
  });
});
