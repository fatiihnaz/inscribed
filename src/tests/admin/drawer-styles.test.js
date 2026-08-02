import { describe, it, expect } from "vitest";
import { panelCss } from "../../admin/drawer-styles.js";

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
    // The break happened mid-comment in the middle of the sheet. The card rules
    // that used to anchor this assertion are gone (the changes preview was the
    // last surface on that language), so anchor on the rules that now sit at
    // that point instead.
    expect(panelCss).toContain(".inscribed-collapse.is-open");
    expect(panelCss).toContain(".inscribed-icon-button");
    // Rules far down the body: present only if the literal ran to completion.
    expect(panelCss).toContain(".inscribed-logout");
    expect(panelCss).toContain("@keyframes inscribed-status-pulse");
  });

  it("leaves no stray backticks that could reopen the literal", () => {
    expect(panelCss).not.toContain("`");
  });
});
