// @vitest-environment jsdom
/**
 * @file `useMediaQuery`, the one breakpoint the drawer answers in JS.
 *
 * The shell's breakpoints stay in CSS on purpose (see `layout-css.js`); this
 * exists for what CSS cannot express, which is which way a framer transition
 * should travel. So the contract that matters is: it tracks changes while
 * mounted, and it unsubscribes when it goes.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

import { useMediaQuery } from "../../shared/ui/use-media-query.js";

const QUERY = "(max-width: 767px)";

/** A controllable MediaQueryList, standing in for the browser's. */
function installMatchMedia(initial) {
  const listeners = new Set();
  const list = {
    matches: initial,
    media: QUERY,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => list);
  return {
    list,
    listeners,
    set(next) {
      list.matches = next;
      for (const fn of listeners) fn();
    },
  };
}

function Probe() {
  return <span data-testid="v">{String(useMediaQuery(QUERY))}</span>;
}

const value = () => screen.getByTestId("v").textContent;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("reads the query on mount", () => {
    installMatchMedia(true);
    render(<Probe />);
    expect(value()).toBe("true");
  });

  it("follows the viewport crossing the breakpoint", () => {
    const mq = installMatchMedia(false);
    render(<Probe />);
    expect(value()).toBe("false");
    act(() => mq.set(true));
    expect(value()).toBe("true");
    act(() => mq.set(false));
    expect(value()).toBe("false");
  });

  it("lets go of the listener when it unmounts", () => {
    const mq = installMatchMedia(false);
    const { unmount } = render(<Probe />);
    expect(mq.listeners.size).toBe(1);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });

  // Safari below 14 has only the old spelling, and this ships to whatever
  // browser the editor happens to be on.
  it("falls back to the legacy listener API", () => {
    const listeners = new Set();
    window.matchMedia = vi.fn(() => ({
      matches: true,
      media: QUERY,
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    }));
    const { unmount } = render(<Probe />);
    expect(value()).toBe("true");
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  // Rendered where there is no viewport to measure, it must not throw.
  it("answers false where matchMedia does not exist", () => {
    // @ts-expect-error deleting the API is the point
    delete window.matchMedia;
    render(<Probe />);
    expect(value()).toBe("false");
  });
});
