import { describe, it, expect } from "vitest";
import { panelCss } from "../components/admin-drawer-styles.js";

// Regression guard for the `panelCss` template literal. An unescaped backtick
// in a CSS comment once closed the literal early, so the rest parsed as JS and
// threw `ReferenceError: block is not defined` on import. A break either throws
// here (import fails) or truncates the string before its tail rules.
describe("panelCss template literal integrity", () => {
  it("evaluates to one continuous CSS string", () => {
    expect(typeof panelCss).toBe("string");
    expect(panelCss.length).toBeGreaterThan(1000);
  });

  it("carries every rule, including ones past the comment that broke it", () => {
    // The break happened mid-comment above the active-card rules; assert the
    // selectors around and after that point survive in the string.
    expect(panelCss).toContain(".inscribed-block-card.is-dirty");
    expect(panelCss).toContain(".inscribed-block-card.inscribed-block-card-active");
    // Rules far down the body: present only if the literal ran to completion.
    expect(panelCss).toContain(".inscribed-logout");
    expect(panelCss).toContain("@keyframes inscribed-status-pulse");
  });

  it("leaves no stray backticks that could reopen the literal", () => {
    expect(panelCss).not.toContain("`");
  });
});
