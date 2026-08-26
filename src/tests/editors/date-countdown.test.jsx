// @vitest-environment jsdom
/**
 * @file The countdown line `DateEditor` draws under the field.
 *
 * Offsets are built from `Date.now()` with a few seconds of slack, so a floor
 * that lands mid-second cannot flip the smallest unit under the test.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key, params) => {
    if (key === "editors.date.remaining") return `${params.time} left`;
    return ({
      "editors.date.days": "days",
      "editors.date.hours": "hours",
      "editors.date.minutes": "mins",
      "editors.date.past": "passed",
    })[key] ?? key;
  },
  useCmsLocale: () => "tr",
}));

import { DateEditor } from "../../editors/fields/DateEditor.jsx";

afterEach(cleanup);

/** @param {number} seconds  Offset from now; negative for a date already gone. */
function countdownAt(seconds) {
  const { container } = render(
    <DateEditor value={new Date(Date.now() + seconds * 1000).toISOString()} onChange={() => {}} />,
  );
  return container.firstChild.lastElementChild.textContent;
}

describe("DateEditor countdown", () => {
  it("names every unit once there are days left", () => {
    expect(countdownAt(2 * 86400 + 3 * 3600 + 4 * 60 + 5)).toBe("2 days 3 hours 4 mins left");
  });

  it("drops the leading units that would read as zero", () => {
    expect(countdownAt(45 * 60 + 5)).toBe("45 mins left");
    expect(countdownAt(3 * 3600 + 5)).toBe("3 hours 0 mins left");
  });

  it("says so instead of counting when the date has gone", () => {
    expect(countdownAt(-60)).toBe("passed");
  });

  it("stays out of the way when the caller turns it off", () => {
    const { container } = render(
      <DateEditor value={new Date(Date.now() + 86400_000).toISOString()} onChange={() => {}} countdown={false} />,
    );
    expect(container.textContent).not.toContain("left");
  });
});
