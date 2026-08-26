/**
 * @file Placement arithmetic for anchored panels.
 *
 * These stand in for the browser nobody can point at this code yet: jsdom
 * measures everything as zero, so the only way to know a calendar flips above a
 * trigger near the bottom of the screen is to feed the maths real rectangles.
 */
import { describe, it, expect } from "vitest";

import { anchorPosition, ANCHOR_GAP, VIEWPORT_MARGIN } from "../../shared/ui/anchor-position.js";

const viewport = { width: 1200, height: 800 };
const panel = { width: 260, height: 300 };

/** @param {Partial<{ top: number, bottom: number, left: number, width: number }>} over */
const anchor = (over = {}) => ({ top: 100, bottom: 130, left: 400, width: 260, ...over });

describe("vertical placement", () => {
  it("sits under the trigger when there is room", () => {
    const p = anchorPosition({ anchor: anchor(), panel, viewport, maxHeight: 320 });
    expect(p.flipped).toBe(false);
    expect(p.top).toBe(130 + ANCHOR_GAP);
  });

  it("flips above when the space below cannot hold it", () => {
    // Trigger near the bottom: 800 - 700 - 8 = 92px below, 300 needed.
    const p = anchorPosition({ anchor: anchor({ top: 670, bottom: 700 }), panel, viewport, maxHeight: 320 });
    expect(p.flipped).toBe(true);
    expect(p.top).toBe(670 - 300 - ANCHOR_GAP);
  });

  it("stays below when neither side fits but below is roomier", () => {
    // 40px above, 130px below: cramped either way, below still wins.
    const p = anchorPosition({ anchor: anchor({ top: 48, bottom: 662 }), panel, viewport, maxHeight: 320 });
    expect(p.flipped).toBe(false);
  });

  it("never places the panel off the top edge when flipped", () => {
    const tall = { width: 260, height: 700 };
    const p = anchorPosition({ anchor: anchor({ top: 300, bottom: 330 }), panel: tall, viewport, maxHeight: 720 });
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it("assumes an unmeasured panel wants its full allowance", () => {
    // Height 0 means "not laid out yet". Treating it as 0 would place the panel
    // below and let it overflow on the very first frame.
    const unmeasured = { width: 260, height: 0 };
    const p = anchorPosition({ anchor: anchor({ top: 670, bottom: 700 }), panel: unmeasured, viewport, maxHeight: 320 });
    expect(p.flipped).toBe(true);
  });
});

describe("horizontal placement", () => {
  it("lines up with the trigger's left edge", () => {
    const p = anchorPosition({ anchor: anchor(), panel, viewport, maxHeight: 320 });
    expect(p.left).toBe(400);
  });

  it("pulls back inside the right edge", () => {
    const p = anchorPosition({ anchor: anchor({ left: 1100 }), panel, viewport, maxHeight: 320 });
    expect(p.left).toBe(1200 - 260 - VIEWPORT_MARGIN);
  });

  it("keeps the margin when the trigger is off the left edge", () => {
    const p = anchorPosition({ anchor: anchor({ left: -40 }), panel, viewport, maxHeight: 320 });
    expect(p.left).toBe(VIEWPORT_MARGIN);
  });

  it("reports the trigger's width, which is what a matched panel takes", () => {
    const p = anchorPosition({ anchor: anchor({ width: 320 }), panel, viewport, maxHeight: 320 });
    expect(p.width).toBe(320);
  });

  it("falls back to the trigger's width while the panel is unmeasured", () => {
    const unmeasured = { width: 0, height: 0 };
    const p = anchorPosition({ anchor: anchor({ left: 1100, width: 260 }), panel: unmeasured, viewport, maxHeight: 320 });
    expect(p.left).toBe(1200 - 260 - VIEWPORT_MARGIN);
  });
});
