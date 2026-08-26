/**
 * @file The one definition of how a field and a panel control react to the
 * pointer and the keyboard.
 *
 * These rules used to live in two places with two different answers: the
 * drawer's sheet styled `.inscribed-field:focus` from the tokens, and
 * `CollectionComposer` shipped its own copy in hardcoded greys because the
 * drawer's sheet is not on a host page. The same input therefore focused
 * differently depending on which surface it rendered on, and any rule written
 * in only one of them was silently dead in the other. This is injected once
 * from `CmsProvider`, above both.
 *
 * The split with inline styles is deliberate: a state the browser knows about
 * (hover, focus, disabled) belongs here, where it costs no render and needs no
 * JavaScript; a state that is our data (which day is selected, which row the
 * keyboard cursor is on) stays inline, because CSS cannot know it.
 *
 * Palettes differ only in two values, so they are custom properties rather than
 * two rule sets. The defaults are the drawer's; `.inscribed-neutral` overrides
 * them for the portable palette, and marking either the control itself or any
 * ancestor works since custom properties inherit.
 */

import {
  ACCENT, COLLECTION_ACCENT, BORDER, BORDER_HI, SURFACE_2, SURFACE_3,
  DUR_FAST, EASE, FS_MICRO, FS_MD, FS_XS, R_SM, R_MD,
  neutralTint as neutral,
} from "../shared/style/tokens.js";

const HOVER = `var(--ins-f-hover, ${SURFACE_3})`;
const LINE = `var(--ins-f-line, ${BORDER_HI})`;
const BG = `var(--ins-f-bg, ${SURFACE_2})`;
const STROKE = `var(--ins-f-stroke, ${BORDER})`;
// The drawer dims a locked field; the portable palette does not, because there
// the label already carries a readOnly tag and dimming as well says it twice.
const DIM = "var(--ins-f-dim, 0.55)";

// Every accent an editor spends resolves through this, so which colour a field
// lights up in is a property of where it renders rather than of the control.
// A collection surface sets it to the collection accent and every focus ring,
// checkmark and chosen cell inside turns with it.
export const ACCENT_VAR = "--ins-f-accent";
const A = `var(${ACCENT_VAR}, ${ACCENT})`;

const EDGE = `color-mix(in srgb, ${A} 45%, transparent)`;
const RING = `0 0 0 1px color-mix(in srgb, ${A} 22%, transparent)`;
const SELECTED_FILL = `color-mix(in srgb, ${A} 12%, transparent)`;
const SELECTED_EDGE = `color-mix(in srgb, ${A} 40%, transparent)`;

export const fieldCss = `
  .inscribed-neutral {
    --ins-f-hover: ${neutral(12)};
    --ins-f-line: ${neutral(30)};
    --ins-f-bg: ${neutral(4)};
    --ins-f-stroke: ${neutral(22)};
    --ins-f-dim: 1;
  }

  .inscribed-collection {
    ${ACCENT_VAR}: ${COLLECTION_ACCENT};
  }

  /* Fields. One geometry for both palettes: they used to differ by a couple of
     pixels of padding and radius for no reason anyone could name, which meant a
     record form and a block editor never quite lined up. Only colour varies now,
     and it varies through the variables above. */
  .inscribed-field {
    font-family: inherit;
    font-size: ${FS_MD}px;
    line-height: 1.4;
    padding: 9px 12px;
    border: 1px solid ${STROKE};
    border-radius: ${R_MD}px;
    background: ${BG};
    color: inherit;
    outline: none;
    transition: background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, box-shadow ${DUR_FAST} ${EASE};
  }
  .inscribed-field:disabled {
    opacity: ${DIM};
    cursor: not-allowed;
  }
  /* A lit control keeps its own surface: hovering one that is already focused
     (or, for a trigger, already open) would be a third state on top of two.
     aria-expanded is the trigger's equivalent of :focus here, since what lights
     it is the panel being down rather than the focus sitting on it. */
  input.inscribed-field:hover:not(:disabled):not(:focus),
  textarea.inscribed-field:hover:not(:disabled):not(:focus),
  button.inscribed-field:hover:not(:disabled):not(:focus):not([aria-expanded="true"]) {
    background-color: ${HOVER};
  }
  /* :focus, not :focus-visible, for the trigger too. These buttons are field
     controls sitting beside text inputs, and a pointer that lights one but not
     the other reads as the two being different kinds of thing. */
  input.inscribed-field:focus,
  textarea.inscribed-field:focus,
  select.inscribed-field:focus,
  button.inscribed-field:focus {
    border-color: ${EDGE};
    box-shadow: ${RING};
  }
  /* Derived from the field's own colour rather than a token, so one rule reads
     on the dark panel and on a light host without a palette override. */
  .inscribed-field::placeholder {
    color: inherit;
    opacity: 0.45;
  }

  /* Panel controls */
  .inscribed-panel-btn {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    /* Stated so a selected control's weight is a swap, not a longhand appearing
       over the shorthand above and being dropped again on the way out. */
    font-weight: 400;
    padding: 0;
    cursor: pointer;
    transition: background-color ${DUR_FAST} ${EASE}, opacity ${DUR_FAST} ${EASE}, box-shadow ${DUR_FAST} ${EASE};
  }
  .inscribed-panel-btn:hover:not(:disabled):not(.is-selected),
  .inscribed-panel-btn:focus-visible:not(.is-selected) {
    background-color: ${HOVER};
    opacity: 1;
  }
  .inscribed-panel-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .inscribed-panel-btn.is-bordered {
    border: 1px solid ${LINE};
  }

  .inscribed-panel-btn--icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: ${R_SM - 2}px;
    opacity: 0.55;
  }
  .inscribed-panel-btn--text {
    padding: 5px 9px;
    border-radius: ${R_SM - 2}px;
    font-size: ${FS_MICRO}px;
    font-weight: 500;
    letter-spacing: 0.02em;
    opacity: 0.6;
  }
  .inscribed-panel-btn--cell {
    padding: 9px 4px;
    border-radius: ${R_SM}px;
    font-size: ${FS_XS}px;
    font-weight: 500;
    text-transform: capitalize;
  }

  /* Chosen. One appearance, listed once, for every place something can be
     the current choice. */
  .inscribed-panel-btn.is-selected,
  .inscribed-picker-row.is-selected,
  .inscribed-day.is-selected {
    background: ${SELECTED_FILL};
    color: ${A};
    box-shadow: inset 0 0 0 1px ${SELECTED_EDGE};
    font-weight: 500;
  }

  /* Any hairline the panels draw: a footer's rule, the clock pill's edge. */
  .inscribed-divider {
    border-color: ${LINE};
  }

  /* A recessed surface inside a panel: the search row, the results box, the
     calendar's month bar. */
  .inscribed-inset {
    background: ${HOVER};
    border: 1px solid ${LINE};
  }

  /* One result row. Active is the keyboard cursor, which the pointer also
     moves, so there is no separate :hover rule to disagree with it. */
  .inscribed-picker-row {
    transition: background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-picker-row.is-active:not(.is-selected) {
    background-color: ${HOVER};
  }

  /* One calendar day. Hover here rather than in React state: the grid is 42
     cells and tracking which one the pointer is over re-rendered all of them. */
  .inscribed-day:hover:not(.is-selected) {
    background-color: ${HOVER};
  }
  .inscribed-day.is-today:not(.is-selected) {
    background-color: ${HOVER};
    box-shadow: inset 0 0 0 1px ${LINE};
  }

  /* Anything that spends the accent as its own colour: a checkmark, the create
     glyph, a countdown's figures. */
  .inscribed-accent {
    color: ${A};
  }
  .inscribed-accent-box {
    background: color-mix(in srgb, ${A} 5%, transparent);
    border: 1px solid color-mix(in srgb, ${A} 12%, transparent);
  }

  /* The clock pill wraps two inputs, so it lights from whichever has focus. */
  .inscribed-clock:hover {
    background-color: ${HOVER};
  }
  .inscribed-clock:focus-within {
    border-color: ${EDGE};
    box-shadow: ${RING};
  }
`;
