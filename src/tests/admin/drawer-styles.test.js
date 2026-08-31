import { describe, it, expect } from "vitest";
import { panelCss, RAIL_CLASS } from "../../admin/drawer-styles.js";
import { localeChipStyle } from "../../admin/collection/collection-styles.js";
import {
  BP_MOBILE, COMPACT_QUERY, PANEL_HANDLE_REACH, PANEL_WIDTH_MOBILE, COLLECTION_ACCENT,
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

/**
 * One rule's body, by its exact selector line. Balanced on braces so a rule
 * whose body contains none of the selector's text is still returned whole.
 */
function rule(selector) {
  const start = panelCss.indexOf(selector);
  if (start === -1) throw new Error(`no rule for ${selector} in panelCss`);
  const open = panelCss.indexOf("{", start);
  const close = panelCss.indexOf("}", open);
  return panelCss.slice(open + 1, close);
}

// Both collection lists (the collections landing and one collection's records)
// used to carry their own hover rule, at different fills, so the same gesture
// got two answers depending on which depth of the same thing you were in.
describe("the collection lists' row states", () => {
  it("runs both lists off one state machine", () => {
    expect(panelCss).toContain(".inscribed-listrow {");
    // The per-list classes are gone rather than aliased: an alias is a place
    // for the two to drift apart again.
    expect(panelCss).not.toContain(".inscribed-region-row");
    expect(panelCss).not.toContain(".inscribed-collection-row");
  });

  it("gives the pointer and the keyboard the same mark", () => {
    // One rule, both selectors: a row is one offer, and lighting it two ways
    // would say it is two.
    expect(panelCss).toContain(".inscribed-listrow:hover,\n  .inscribed-listrow:focus-visible {");
    const lit = rule(".inscribed-listrow:hover,");
    expect(lit).toContain("box-shadow: inset 0 0 0 1px");
    expect(lit).toContain("background:");
    // Replaces the browser outline rather than adding to it, so the mark
    // follows the row's own radius.
    expect(lit).toContain("outline: none;");
  });

  it("states the ring at rest so it fades in rather than appearing whole", () => {
    expect(rule(".inscribed-listrow {")).toContain("box-shadow: inset 0 0 0 1px transparent;");
  });

  it("answers a press without resampling the row's text", () => {
    const pressed = rule(".inscribed-listrow:active {");
    expect(pressed).toContain("transform: translateY(1px);");
    // A scale on a text row blurs every glyph for the length of the press.
    expect(pressed).not.toContain("scale(");
  });

  it("wears the collection accent when the page has that record selected", () => {
    expect(rule(".inscribed-listrow.is-active {")).toContain("box-shadow: inset 0 0 0 1px");
  });

  // Only the row under the pointer shows one; repeated down every row it stops
  // being an affordance and turns into texture.
  it("reveals the chevron on hover and focus, and nowhere else", () => {
    expect(rule(".inscribed-list-chevron {")).toContain("opacity: 0;");
    expect(panelCss).toContain(".inscribed-listrow:hover .inscribed-list-chevron,");
    expect(panelCss).toContain(".inscribed-listrow:focus-visible .inscribed-list-chevron {");
    expect(panelCss).not.toContain(".inscribed-listrow.is-active .inscribed-list-chevron");
  });
});

// The detail pane's translation chips are buttons: one opens the record in
// another language, one composes it. They carried their fill and colour inline,
// which outranks any rule, so neither answered the pointer at all.
describe("the translation chips", () => {
  it("leaves fill and colour to the sheet, so a state rule can win", () => {
    expect(localeChipStyle.background).toBeUndefined();
    expect(localeChipStyle.color).toBeUndefined();
    expect(localeChipStyle.boxShadow).toBeUndefined();
    // Geometry is still the style object's: CSS has no reason to hold it.
    expect(localeChipStyle.padding).toBeTruthy();
    expect(localeChipStyle.cursor).toBe("pointer");
  });

  it("answers the pointer and the keyboard", () => {
    expect(panelCss).toContain(".inscribed-locale-chip {");
    expect(panelCss).toContain(".inscribed-locale-chip:hover,\n  .inscribed-locale-chip:focus-visible {");
    expect(panelCss).toContain(".inscribed-locale-chip:active {");
  });

  // Composing a language is a create action, so it spends the collection accent
  // the way the "+ Yeni" row does rather than the neutral lift.
  it("tints the one that composes a language with the collection accent", () => {
    const lit = rule(".inscribed-locale-chip-add:hover,");
    expect(lit).toContain(COLLECTION_ACCENT);
  });
});

describe("dead rules", () => {
  // Had a transition and a focus ring and no element wearing it.
  it("carries no rule for a class nothing renders", () => {
    expect(panelCss).not.toContain("inscribed-create-card");
  });
});

// The toolbar was four unlabelled 24px squares; the only way to know which one
// showed the archive was to have learned it.
describe("the collection toolbar's chips", () => {
  it("answers hover, focus, press and the on state", () => {
    expect(panelCss).toContain(".inscribed-toolchip {");
    expect(panelCss).toContain(".inscribed-toolchip:hover:not(:disabled) {");
    expect(panelCss).toContain(".inscribed-toolchip:focus-visible {");
    expect(rule(".inscribed-toolchip:active:not(:disabled) {")).toContain("translateY(1px)");
  });

  // A label says what the control is; only the toggle's own state needs colour.
  it("wears the collection accent only while the toggle is on", () => {
    expect(rule(".inscribed-toolchip.is-on,")).toContain(COLLECTION_ACCENT);
    expect(rule(".inscribed-toolchip {")).not.toContain(COLLECTION_ACCENT);
  });
});

describe("the create row", () => {
  // It is the one thing the screen exists to let you do, so it does not wait to
  // be pointed at before looking like a control.
  it("is tinted at rest, not only on hover", () => {
    const resting = rule(".inscribed-create-row {");
    expect(resting).toContain(COLLECTION_ACCENT);
    expect(resting).toContain("background:");
  });

  it("answers a press", () => {
    expect(rule(".inscribed-create-row:active {")).toContain("translateY(1px)");
  });
});
