import { describe, it, expect } from "vitest";
import { panelCss, RAIL_CLASS } from "../../admin/drawer-styles.js";
import {
  BP_MOBILE, COMPACT_QUERY, PANEL_HANDLE_REACH, PANEL_WIDTH_MOBILE,
} from "../../shared/style/tokens.js";

/**
 * The rules a media query block holds, without the ones around it. Balanced on
 * braces rather than cut at the next `@media`, which would run past the block's
 * own end and pick up whatever follows it.
 */
function band(query) {
  const start = panelCss.indexOf(`@media ${query}`);
  if (start === -1) throw new Error(`no @media ${query} in panelCss`);
  let depth = 0;
  for (let i = panelCss.indexOf("{", start); i < panelCss.length; i += 1) {
    if (panelCss[i] === "{") depth += 1;
    else if (panelCss[i] === "}") {
      depth -= 1;
      if (depth === 0) return panelCss.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced @media ${query} in panelCss`);
}

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

describe("the panel on a phone", () => {
  it("leaves the screen exactly the reach of its handle", () => {
    // The handle hangs off the panel's right edge; take the full width and it
    // hangs off the screen with nothing left to reopen by.
    expect(PANEL_WIDTH_MOBILE).toBe(`calc(100% - ${PANEL_HANDLE_REACH}px)`);
  });

});

describe("the mode rail's orientation", () => {
  it("turns exactly once, in a band that reaches the phone", () => {
    // Below the wide shell the panel is short of width either way, so one band
    // covers both. Turning it back on the phone would spend the height that a
    // full-height panel has to spare, to buy width it does not need.
    // Matched with the brace: `.inscribed-rail` is a prefix of the button's
    // own class, so the bare name hits rules unrelated to this.
    const compact = band(COMPACT_QUERY);
    expect(compact).toContain(`.${RAIL_CLASS} {`);
    expect(compact).toContain("flex-direction: row;");

    const ceiling = Number(/max-width: (\d+)px/.exec(COMPACT_QUERY)?.[1]);
    expect(ceiling).toBeGreaterThanOrEqual(BP_MOBILE);
  });
});
