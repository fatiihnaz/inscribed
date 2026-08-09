// @vitest-environment jsdom
/**
 * The drawer's grow-and-shrink primitive.
 *
 * Two of these were written by hand and both landed on the same broken shape:
 * fade the box at full height, and let a `layout` projection on a neighbour
 * glide by whatever appeared. Coming out, the fade finished, React removed the
 * node a frame later, and everything below jumped. So the properties worth
 * pinning are the ones that were wrong, not the animation itself:
 *
 *   - the content stays mounted while it is on its way out (jsdom runs no
 *     frames, so the assertion is that removal is not synchronous with `show`
 *     going false)
 *   - the element that animates clips, so the content inside keeps its natural
 *     size instead of reflowing at every intermediate height
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, waitFor } from "@testing-library/react";

import { Collapse } from "../../admin/Collapse.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BODY = "çakışma paneli";

describe("Collapse", () => {
  it("shows nothing when closed", () => {
    render(<Collapse show={false}><p>{BODY}</p></Collapse>);
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it("clips whatever it animates, so the content keeps its own size", () => {
    const { container } = render(<Collapse show><p>{BODY}</p></Collapse>);
    const clip = container.firstElementChild;
    expect(clip).toBeTruthy();
    // Without this the height animation reflows the text at every step, which
    // is what squashed the panel on the way in.
    expect(/** @type {HTMLElement} */ (clip).style.overflow).toBe("hidden");
    // The content is a child of the clip, not the animated element itself.
    expect(clip.contains(screen.getByText(BODY))).toBe(true);
  });

  it("keeps the content mounted past the moment it is told to close", async () => {
    const { rerender } = render(<Collapse show><p>{BODY}</p></Collapse>);
    expect(screen.getByText(BODY)).toBeTruthy();

    rerender(<Collapse show={false}><p>{BODY}</p></Collapse>);
    // Still there: the exit has to run before the node goes, which is the whole
    // difference between the space closing and the space vanishing.
    expect(screen.queryByText(BODY)).toBeTruthy();

    await waitFor(() => expect(screen.queryByText(BODY)).toBeNull());
  });

  it("does not replay for something already open when it mounts", () => {
    // Reopening the drawer over a standing conflict remounts the card. The
    // panel should simply be there rather than animating in from nothing.
    const { container } = render(<Collapse show><p>{BODY}</p></Collapse>);
    const clip = /** @type {HTMLElement} */ (container.firstElementChild);
    expect(clip.style.height).not.toBe("0px");
  });
});
