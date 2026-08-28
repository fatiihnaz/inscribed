import { describe, it, expect } from "vitest";
import { layoutCss, PAGE_SHELL_CLASS } from "../../shared/style/layout-css.js";
import { PANEL_WIDTH } from "../../shared/style/tokens.js";

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

  it("reads the width through the custom property a media query can move", () => {
    expect(layoutCss).toContain("margin-left: var(--ins-panel-w");
  });

  it("bakes the panel token in as the property's fallback", () => {
    expect(layoutCss).toContain(`var(--ins-panel-w, ${PANEL_WIDTH}px)`);
  });
});
