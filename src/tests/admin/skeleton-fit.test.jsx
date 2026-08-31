// @vitest-environment jsdom
/**
 * @file The placeholder rows have to be the shape of the rows they stand in
 * for. That is the whole job: a skeleton at the wrong height is a list that
 * jumps the moment the real rows land, which is the thing it exists to prevent.
 *
 * The record row grew a thumbnail and a second line and the skeleton stayed at
 * its old 32px single-line shape, so these tie the two together: the assertions
 * read the row's own style objects rather than repeating their numbers.
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

import { SkeletonRows } from "../../admin/Skeleton.jsx";
import { rowStyle, thumbStyle } from "../../admin/collection/collection-styles.js";

afterEach(cleanup);

/** The props `RegionSection` hands it for a collection that carries images. */
const RECORD_WITH_IMAGE = { count: 3, lines: 2, height: 50, gap: 11, lead: "thumb" };
const RECORD_NO_IMAGE = { ...RECORD_WITH_IMAGE, lead: "mark" };

const rows = (container) => [...container.querySelectorAll("li")];

describe("the record list's skeleton", () => {
  it("stands at the record row's own height", () => {
    const { container } = render(<SkeletonRows {...RECORD_WITH_IMAGE} />);
    for (const li of rows(container)) {
      expect(li.style.minHeight).toBe(`${rowStyle.minHeight}px`);
    }
  });

  it("reserves the thumbnail at the size the row draws it", () => {
    const { container } = render(<SkeletonRows {...RECORD_WITH_IMAGE} />);
    const lead = rows(container)[0].firstElementChild;
    expect(lead?.style.width).toBe(`${thumbStyle.width}px`);
    expect(lead?.style.height).toBe(`${thumbStyle.height}px`);
    // Still shimmering: an image is content that is on its way.
    expect(lead?.className).toContain("inscribed-skeleton");
  });

  // The marker is chrome the row always wears, not content still loading, so it
  // is drawn solid rather than pulsing as if something were about to replace it.
  it("draws the marker solid where the collection has no images", () => {
    const { container } = render(<SkeletonRows {...RECORD_NO_IMAGE} />);
    const lead = rows(container)[0].firstElementChild;
    expect(lead?.className).not.toContain("inscribed-skeleton");
    expect(lead?.style.width).toBe("8px");
  });

  it("carries two bars, matching the row's two lines", () => {
    const { container } = render(<SkeletonRows {...RECORD_WITH_IMAGE} />);
    const bars = rows(container)[0].querySelectorAll("span.inscribed-skeleton");
    // The lead plus both text bars.
    expect(bars.length).toBe(3);
  });

  // Equal-length bars read as a table rather than as text.
  it("varies the bar widths down the list", () => {
    const { container } = render(<SkeletonRows {...RECORD_WITH_IMAGE} />);
    const widths = rows(container).map(
      (li) => li.querySelectorAll("span.inscribed-skeleton")[1].style.width,
    );
    expect(new Set(widths).size).toBe(widths.length);
  });
});

describe("the collections list's skeleton", () => {
  // That list still leads with a 20px type badge, so its own shape is unchanged.
  it("keeps the type badge in the lead", () => {
    const { container } = render(<SkeletonRows count={2} lines={2} height={44} />);
    const lead = rows(container)[0].firstElementChild;
    expect(lead?.style.width).toBe("20px");
    expect(rows(container)[0].style.minHeight).toBe("44px");
  });

  it("is announced to nobody: it carries no information", () => {
    const { container } = render(<SkeletonRows count={2} />);
    expect(container.querySelector("ul")?.getAttribute("aria-hidden")).toBe("true");
  });
});
