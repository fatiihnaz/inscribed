// @vitest-environment jsdom
/**
 * @file Which way a lateral switch travelled.
 *
 * Switching collections used to be a hard cut, and the obvious fix — always
 * sliding the same way — says the strip has an order it does not follow. The
 * direction comes from the strip itself, and it has to be settled in the render
 * the new key arrives in: an effect settles after the frame that starts the
 * animation, so the first switch would play in the previous one's direction.
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

import { switchDirection, useSwitchDirection } from "../../shared/ui/use-switch-direction.js";
import { switchMotion, SWITCH_TRAVEL } from "../../shared/style/drill-motion.js";

afterEach(cleanup);

const STRIP = ["news", "events", "staff"];

describe("switchDirection", () => {
  it("reads forward and backward off the strip's order", () => {
    expect(switchDirection(STRIP, "news", "staff")).toBe(1);
    expect(switchDirection(STRIP, "staff", "news")).toBe(-1);
    expect(switchDirection(STRIP, "events", "staff")).toBe(1);
    expect(switchDirection(STRIP, "events", "news")).toBe(-1);
  });

  // A collection can leave the strip while it is open (a permission change, a
  // page navigation). A missing neighbour is not a reason to refuse to animate.
  it("falls forward for a key the strip no longer holds", () => {
    expect(switchDirection(STRIP, "gone", "news")).toBe(1);
    expect(switchDirection(STRIP, "news", "gone")).toBe(1);
    expect(switchDirection([], "news", "events")).toBe(1);
  });

  it("falls forward when there is nothing to have come from", () => {
    expect(switchDirection(STRIP, null, "news")).toBe(1);
    expect(switchDirection(STRIP, "news", null)).toBe(1);
  });
});

/** Renders the hook's answer, and counts how often it rendered. */
function Probe({ order, activeKey, onRender }) {
  const direction = useSwitchDirection(order, activeKey);
  onRender?.();
  return <span data-testid="dir">{direction}</span>;
}

const dir = () => screen.getByTestId("dir").textContent;

describe("useSwitchDirection", () => {
  it("starts forward, with nothing to compare against", () => {
    render(<Probe order={STRIP} activeKey="events" />);
    expect(dir()).toBe("1");
  });

  // The whole point: the answer is right on the render the new key arrives in,
  // not one frame later.
  it("has the direction settled before the switch is painted", () => {
    const { rerender } = render(<Probe order={STRIP} activeKey="staff" />);
    rerender(<Probe order={STRIP} activeKey="news" />);
    expect(dir()).toBe("-1");
    rerender(<Probe order={STRIP} activeKey="staff" />);
    expect(dir()).toBe("1");
  });

  it("holds the last direction while the key stays put", () => {
    const { rerender } = render(<Probe order={STRIP} activeKey="staff" />);
    rerender(<Probe order={STRIP} activeKey="news" />);
    expect(dir()).toBe("-1");
    // A re-render for some other reason must not flip it back.
    rerender(<Probe order={STRIP} activeKey="news" />);
    expect(dir()).toBe("-1");
  });

  // Adjusting state during render re-runs the component immediately; it must
  // settle rather than loop.
  it("settles in one extra render instead of looping", () => {
    let renders = 0;
    const count = () => { renders += 1; };
    const { rerender } = render(<Probe order={STRIP} activeKey="news" onRender={count} />);
    renders = 0;
    act(() => {
      rerender(<Probe order={STRIP} activeKey="staff" onRender={count} />);
    });
    expect(renders).toBeLessThanOrEqual(2);
    expect(dir()).toBe("1");
  });

  it("answers for a strip that closes entirely", () => {
    const { rerender } = render(<Probe order={STRIP} activeKey="news" />);
    rerender(<Probe order={STRIP} activeKey={null} />);
    expect(dir()).toBe("1");
  });
});

describe("switchMotion", () => {
  // The strip runs left to right in the side column, and the switch travels
  // along it: that is what says the editor stepped rather than descended.
  it("travels along the strip in the side column", () => {
    expect(switchMotion(1, false).initial).toEqual({ opacity: 0, x: SWITCH_TRAVEL });
    expect(switchMotion(-1, false).initial).toEqual({ opacity: 0, x: -SWITCH_TRAVEL });
  });

  // Docked as a sheet there is no such axis: the sheet's own gesture is
  // vertical, and a panel sliding sideways inside it reads as a carousel.
  it("comes up from below on a sheet, whichever way the strip went", () => {
    for (const direction of /** @type {const} */ ([-1, 1])) {
      const motion = switchMotion(direction, true);
      expect(motion.initial).toEqual({ opacity: 0, y: SWITCH_TRAVEL });
      expect("x" in /** @type {*} */ (motion.initial)).toBe(false);
    }
  });

  // Both axes are settled by the end, whichever one it arrived on.
  it("lands at rest on both axes", () => {
    for (const vertical of [false, true]) {
      expect(switchMotion(1, vertical).animate).toEqual({ opacity: 1, x: 0, y: 0 });
    }
  });

  // The collection being left has already been decided against.
  it("never travels on the way out", () => {
    for (const vertical of [false, true]) {
      expect(switchMotion(1, vertical).exit).toEqual({ opacity: 0 });
    }
  });
});
