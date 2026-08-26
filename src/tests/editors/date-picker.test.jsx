// @vitest-environment jsdom
/**
 * @file `DatePicker` behaviour, which replaced the native `datetime-local` box.
 *
 * Assertions go through the emitted ISO string rather than the rendered grid:
 * the layout is free to change, but what lands in the block must not. Times are
 * compared as local hours, so the suite passes in any timezone.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../core/hooks/use-cms-strings.js", () => ({
  useCmsStrings: () => (key) => key,
  useCmsLocale: () => "tr",
}));

import { DatePicker } from "../../editors/fields/DatePicker.jsx";

afterEach(cleanup);

/** @param {string} value */
function mountPicker(value) {
  const onChange = vi.fn();
  render(<DatePicker value={value} onChange={onChange} />);
  return { onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
}

const openCalendar = () => fireEvent.click(screen.getByRole("button", { expanded: false }));

describe("DatePicker", () => {
  it("names the trigger with the value, and prompts when there is none", () => {
    const { onChange } = mountPicker("");
    expect(screen.getByRole("button", { name: /editors\.date\.pick/ })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the time of day when only the day changes", () => {
    // Built locally so the hour under test is the hour the editor sees.
    const start = new Date(2026, 2, 10, 14, 30, 0, 0);
    const { last } = mountPicker(start.toISOString());

    openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "20" }));

    const next = new Date(last());
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });

  it("starts an unset field at midnight rather than the current time", () => {
    const { last } = mountPicker("");
    openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "15" }));

    const picked = new Date(last());
    expect(picked.getDate()).toBe(15);
    expect(picked.getHours()).toBe(0);
    expect(picked.getMinutes()).toBe(0);
  });

  it("clears to an empty string, not to today", () => {
    const { last } = mountPicker(new Date(2026, 2, 10, 9, 0).toISOString());
    openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "editors.date.clear" }));
    expect(last()).toBe("");
  });

  it("moves a month at a time without touching the value", () => {
    const { onChange } = mountPicker(new Date(2026, 2, 10, 9, 0).toISOString());
    openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "editors.date.prevMonth" }));
    // The header, not a missing day number: the grid always draws 42 cells and
    // fills the edges from the neighbouring months, so a February view still
    // carries a 30th (January's). Formatted here rather than written out so the
    // assertion tracks whatever the runtime's ICU calls the month.
    const february = new Intl.DateTimeFormat("tr", { month: "long", year: "numeric" })
      .format(new Date(2026, 1, 1));
    expect(screen.getByRole("button", { name: february })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
