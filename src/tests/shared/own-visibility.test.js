/**
 * The gate props' resolution, shared by `<EditableRegion>`, `<EditableList>`
 * and `<CmsGroup>`.
 *
 * Two spellings reach this function: `hidden`/`readOnly` and the older,
 * inverted `visible`/`editable`. The pins below are the ones that would break
 * a site silently rather than loudly: an unpassed prop must not gate anything
 * (otherwise every block locks itself), and the older spelling's `true` must
 * stay a no-op rather than becoming an unlock.
 */
import { describe, it, expect } from "vitest";

import { ownVisibility } from "../../shared/state/group-context.js";

describe("ownVisibility", () => {
  it("gates nothing when no gate prop is passed", () => {
    expect(ownVisibility({})).toBe(null);
  });

  it("reads the current spelling as bare booleans", () => {
    expect(ownVisibility({ hidden: true })).toBe("hidden");
    expect(ownVisibility({ readOnly: true })).toBe("readonly");
    expect(ownVisibility({ hidden: false, readOnly: false })).toBe(null);
  });

  it("still reads the older, inverted spelling", () => {
    expect(ownVisibility({ visible: false })).toBe("hidden");
    expect(ownVisibility({ editable: false })).toBe("readonly");
  });

  it("treats the older spelling's true as no opinion, not as an unlock", () => {
    // These never loosened anything: a block inside a locked `<CmsGroup>` could
    // not re-enable itself, and reading them as truthy would hand it that.
    expect(ownVisibility({ visible: true })).toBe(null);
    expect(ownVisibility({ editable: true })).toBe(null);
    expect(ownVisibility({ hidden: true, visible: true })).toBe("hidden");
  });

  it("resolves both spellings on one component most-restrictive-first", () => {
    expect(ownVisibility({ hidden: true, editable: false })).toBe("hidden");
    expect(ownVisibility({ readOnly: true, visible: false })).toBe("hidden");
    expect(ownVisibility({ readOnly: false, visible: false })).toBe("hidden");
  });
});
