import { describe, it, expect } from "vitest";
import { layoutCss, PAGE_SHELL_CLASS } from "../../shared/style/layout-css.js";
import {
  FS_MD, FS_SCALE_MOBILE, MOBILE_QUERY, NARROW_QUERY,
  PANEL_WIDTH, PANEL_WIDTH_MOBILE, PANEL_WIDTH_NARROW,
} from "../../shared/style/tokens.js";

/** The rules one media query block holds, balanced on braces. */
function band(css, query) {
  const start = css.indexOf(`@media ${query}`);
  if (start === -1) throw new Error(`no @media ${query}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced @media ${query}`);
}

describe("layoutCss", () => {
  it("moves the shell only while the drawer is open", () => {
    // `PageShell` keeps the class on for the whole admin session and toggles
    // the attribute, so the margin has to hang off the attribute.
    expect(layoutCss).toContain(`.${PAGE_SHELL_CLASS}[data-drawer-open="true"]`);
    const base = layoutCss.slice(
      layoutCss.indexOf(`.${PAGE_SHELL_CLASS} {`),
      layoutCss.indexOf(`.${PAGE_SHELL_CLASS}[`),
    );
    expect(base).not.toContain("margin-left: var(");
  });

  it("reads the width through the custom property the breakpoints move", () => {
    expect(layoutCss).toContain("margin-left: var(--ins-panel-w");
    expect(layoutCss).toContain(`var(--ins-panel-w, ${PANEL_WIDTH}px)`);
  });

  it("changes only the panel's width across the bands", () => {
    // One shell at every size. If a band ever starts moving the panel rather
    // than resizing it, this is the assumption that broke.
    expect(band(layoutCss, NARROW_QUERY)).toContain(
      `--ins-panel-w: ${PANEL_WIDTH_NARROW}px;`,
    );
    expect(band(layoutCss, MOBILE_QUERY)).toContain(
      `--ins-panel-w: ${PANEL_WIDTH_MOBILE};`,
    );
  });

  it("stops pushing the page once the panel covers it", () => {
    const mobile = layoutCss.slice(layoutCss.lastIndexOf(`@media ${MOBILE_QUERY}`));
    expect(mobile).toContain("margin-left: 0;");
  });
});

describe("the type ramp on a phone", () => {
  it("carries the field size past what makes iOS zoom", () => {
    // The whole reason the ramp scales rather than the controls alone: iOS
    // zooms the page when a focused control's text is under 16px, and lifting
    // just the control would leave it towering over its own label.
    const desktop = Number(/([\d.]+)px/.exec(FS_MD)?.[1]);
    expect(desktop * FS_SCALE_MOBILE).toBeGreaterThanOrEqual(16);
  });

  it("scales every size from one custom property", () => {
    expect(band(layoutCss, MOBILE_QUERY)).toContain(`--ins-fs-scale: ${FS_SCALE_MOBILE};`);
  });
});

describe("the breakpoints", () => {
  it("leave the two bands disjoint, so neither depends on rule order", () => {
    const floor = Number(/min-width: (\d+)px/.exec(NARROW_QUERY)?.[1]);
    const ceiling = Number(/max-width: (\d+)px/.exec(MOBILE_QUERY)?.[1]);
    expect(ceiling).toBe(floor - 1);
  });
});
