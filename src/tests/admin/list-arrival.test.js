/**
 * @file How a list lands.
 *
 * Deliberately one block rather than a per-row cascade. The page size is 50 and
 * "Load more" accumulates past it, so a stagger would still be arriving seconds
 * after the list was asked for, and every row past the eighth would animate
 * below the fold where nobody can see it. `panel-motion.js` made the same call
 * for a calendar's forty-two cells; these hold it.
 */
import { describe, it, expect } from "vitest";

import {
  listArrival, LIST_RISE, LIST_ARRIVE_TRANSITION, LIST_LEAVE_TRANSITION,
} from "../../admin/collection/collection-styles.js";

describe("listArrival", () => {
  it("rises once, as one block", () => {
    const rows = listArrival(true);
    expect(rows.initial).toEqual({ opacity: 0, y: LIST_RISE });
    expect(rows.animate).toEqual({ opacity: 1, y: 0 });
  });

  // A placeholder that travels reads as the content arriving twice: once as the
  // skeleton, once as the rows standing in its place.
  it("cross-fades a skeleton or an empty state in place", () => {
    const other = listArrival(false);
    expect(other.initial).toEqual({ opacity: 0 });
    expect("y" in /** @type {*} */ (other.initial)).toBe(false);
  });

  // Leaving has already been decided; watching it travel only delays what comes
  // next.
  it("never travels on the way out", () => {
    for (const rises of [true, false]) {
      expect(listArrival(rises).exit).toEqual({ opacity: 0 });
    }
  });

  it("leaves faster than it arrives", () => {
    expect(LIST_LEAVE_TRANSITION.duration).toBeLessThan(LIST_ARRIVE_TRANSITION.duration);
    expect(listArrival(true).transition.exit).toBe(LIST_LEAVE_TRANSITION);
  });

  // The budget the rest of the panel moves on. A list that takes longer than a
  // pane slide reads as the list refusing to appear.
  it("lands inside the panel's own motion budget", () => {
    expect(LIST_ARRIVE_TRANSITION.duration).toBeLessThanOrEqual(0.2);
  });

  // The whole point of the single block: no `staggerChildren` anywhere, so the
  // cost is flat in the number of rows.
  it("staggers nothing", () => {
    const json = JSON.stringify(listArrival(true));
    expect(json).not.toContain("stagger");
    expect(json).not.toContain("delayChildren");
  });
});
