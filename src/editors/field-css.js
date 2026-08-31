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
  DUR_BASE, DUR_FAST, EASE, FS_MICRO, FS_MD, FS_SM, FS_XS, R_SM, R_MD,
  neutralTint as neutral,
} from "../shared/style/tokens.js";

const HOVER = `var(--ins-f-hover, ${SURFACE_3})`;
const LINE = `var(--ins-f-line, ${BORDER_HI})`;
const BG = `var(--ins-f-bg, ${SURFACE_2})`;
const STROKE = `var(--ins-f-stroke, ${BORDER})`;
// The drawer dims a locked field; the portable palette does not, because there
// the label already carries a readOnly tag and dimming as well says it twice.
const DIM = "var(--ins-f-dim, 0.55)";

// The palette values a surface outside this sheet paints with. The repeatable's
// index badge and the rule under its header are inline styles, so they reach the
// custom properties through these rather than through a rule.
export const FIELD_HOVER = HOVER;
export const FIELD_LINE = LINE;

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
    /* Nothing resets box-sizing for the SDK's own markup. Under content-box a
       field asked to fill its row lands wider than the row by its own padding
       and border, and spills sideways. */
    box-sizing: border-box;
    font-family: inherit;
    font-size: ${FS_MD};
    line-height: 1.4;
    padding: 7px 11px;
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

  /* Two inputs that are halves of one value (a link's text and its address)
     framed as one control. Same edge and fill as a field, and like the clock
     pill it lights from whichever half holds the focus. */
  .inscribed-field-group {
    box-sizing: border-box;
    border: 1px solid ${STROKE};
    border-radius: ${R_MD}px;
    background: ${BG};
    transition: background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, box-shadow ${DUR_FAST} ${EASE};
  }
  .inscribed-field-group:hover:not(:focus-within) {
    background-color: ${HOVER};
  }
  .inscribed-field-group:focus-within {
    border-color: ${EDGE};
    box-shadow: ${RING};
  }
  /* The halves give up their own frame: the group carries it, and two nested
     borders lighting at once reads as two controls again. Listed at three
     classes so these beat the element-qualified field rules above. */
  /* The group owns its rows: each is the frame for one half, and the glyph in
     the gutter is placed against it. */
  .inscribed-field-group > * {
    position: relative;
    display: flex;
    align-items: center;
  }
  /* The rule between two halves stops short of the frame, by the field's own
     text inset. Run edge to edge it meets the border on both sides and the one
     control reads as two stacked ones again, which is what the frame undoes. */
  .inscribed-field-group > * + *::before {
    content: "";
    position: absolute;
    top: 0;
    left: 11px;
    right: 11px;
    border-top: 1px solid ${LINE};
  }
  .inscribed-field-group .inscribed-field {
    width: 100%;
    border-radius: 0;
  }
  .inscribed-field-group .inscribed-field,
  .inscribed-field-group .inscribed-field:hover:not(:disabled):not(:focus),
  .inscribed-field-group .inscribed-field:focus {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  /* Panel controls. The browser's own focus ring is replaced rather than just
     removed: these are buttons, so dropping the outline without putting
     something back would leave a keyboard user with no idea where they are.
     Ours is an outline too, not a shadow, so it does not fight the inset one a
     selected row already carries. */
  .inscribed-panel-btn,
  .inscribed-picker-row,
  .inscribed-day,
  .inscribed-chip-remove {
    outline: none;
  }
  .inscribed-panel-btn:focus-visible,
  .inscribed-picker-row:focus-visible,
  .inscribed-day:focus-visible,
  .inscribed-chip-remove:focus-visible {
    outline: 1px solid ${EDGE};
    outline-offset: -1px;
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
    font-size: ${FS_MICRO};
    font-weight: 500;
    letter-spacing: 0.02em;
    opacity: 0.6;
  }
  .inscribed-panel-btn--cell {
    padding: 9px 4px;
    border-radius: ${R_SM}px;
    font-size: ${FS_XS};
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
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 9px;
    border: none;
    border-radius: ${R_SM - 2}px;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: ${FS_SM};
    font-weight: 400;
    text-align: left;
    cursor: pointer;
    transition: background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-picker-row.is-active:not(.is-selected) {
    background-color: ${HOVER};
  }

  /* One calendar day. Hover here rather than in React state: the grid is 42
     cells and tracking which one the pointer is over re-rendered all of them. */
  .inscribed-day {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: ${R_SM}px;
    /* A button with no background of its own falls back to the UA's grey
       buttonface, so the resting state has to be stated. */
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: ${FS_XS};
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color ${DUR_FAST} ${EASE};
  }
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

  /* The number field's own stepper. The browser's spinners cannot be styled,
     only removed, so they are removed and replaced with buttons that match
     every other control here. */
  .inscribed-field[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .inscribed-field[type="number"]::-webkit-outer-spin-button,
  .inscribed-field[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }
  .inscribed-stepper {
    position: absolute;
    top: 3px;
    bottom: 3px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .inscribed-stepper > button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    width: 20px;
    padding: 0;
    border: none;
    border-radius: ${R_SM - 3}px;
    background: transparent;
    color: inherit;
    opacity: 0.4;
    cursor: pointer;
    outline: none;
    transition: opacity ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-stepper > button:hover,
  .inscribed-stepper > button:focus-visible {
    opacity: 1;
    background: ${HOVER};
  }
  .inscribed-stepper > button:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  /* The image dropzone. Dragging is a real event the browser reports to us, so
     it arrives as a class rather than a pseudo-class, but it lands in the same
     place as every other state. */
  .inscribed-dropzone {
    border: 1.5px dashed ${LINE};
    border-radius: ${R_MD}px;
    background: ${BG};
    color: inherit;
    font-family: inherit;
    transition: border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-dropzone:hover,
  .inscribed-dropzone:focus-visible {
    background: ${HOVER};
  }
  .inscribed-dropzone.is-dragging {
    border-color: color-mix(in srgb, ${A} 55%, transparent);
    background: color-mix(in srgb, ${A} 8%, transparent);
  }

  /* One entry in a repeatable editor. Both repeatables drew this themselves and
     disagreed: one tinted the resting card with the accent, the other kept it
     neutral. Neutral wins, because a resting surface is not somewhere the
     accent is spent; the add row below is, since that one is a create action. */
  .inscribed-repeat-item {
    border: 1px solid ${LINE};
    border-radius: ${R_MD}px;
    background: ${BG};
    overflow: hidden;
    transition: background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE};
  }
  .inscribed-repeat-item:hover {
    background: ${HOVER};
  }
  /* A repeatable row in the drawer's own language. The drawer shows hierarchy
     with a hairline guide, not with boxes, so a list of bordered cards nested
     inside a guide-indented body read as a foreign idiom three levels deep.
     There is no card here: a header line, and when the row is open a body hung
     off a hairline under the header's badge.

     The border is declared and transparent rather than absent, so the lifted
     look a dragged row takes shifts nothing on the rows it travels past. */
  .inscribed-repeat-row {
    border: 1px solid transparent;
    border-radius: ${R_MD}px;
    transition: border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE};
  }
  /* A row that holds a sub-form is a container, and the drawer fills a
     container's header on hover rather than only lifting its text. */
  .inscribed-repeat-row-header {
    border-radius: ${R_SM}px;
    background: transparent;
    transition: background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-repeat-row-header:hover {
    background: ${HOVER};
  }

  .inscribed-repeat-add {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 11px;
    border: 1px dashed color-mix(in srgb, ${A} 35%, transparent);
    border-radius: ${R_MD}px;
    background: color-mix(in srgb, ${A} 4%, transparent);
    color: color-mix(in srgb, ${A} 75%, transparent);
    font-family: inherit;
    font-size: ${FS_SM};
    font-weight: 500;
    cursor: pointer;
    transition: background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, color ${DUR_FAST} ${EASE};
  }
  .inscribed-repeat-add:hover,
  .inscribed-repeat-add:focus-visible {
    background: color-mix(in srgb, ${A} 10%, transparent);
    border-color: color-mix(in srgb, ${A} 70%, transparent);
    color: ${A};
  }

  /* The Yes/No switch. The checkbox stays in the tree, visually hidden, so the
     control keeps its native keyboard and screen-reader behaviour; checked and
     focus are read off it here rather than mirrored into React state. */
  .inscribed-switch {
    position: relative;
    flex-shrink: 0;
    width: 32px;
    height: 18px;
    border-radius: 99px;
    background: ${LINE};
    transition: background-color ${DUR_FAST} ${EASE}, box-shadow ${DUR_FAST} ${EASE};
  }
  .inscribed-switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: left ${DUR_BASE} ${EASE};
  }
  .inscribed-switch-input:checked + .inscribed-switch {
    background: color-mix(in srgb, ${A} 80%, transparent);
  }
  .inscribed-switch-input:checked + .inscribed-switch::after {
    left: 16px;
  }
  .inscribed-switch-input:focus-visible + .inscribed-switch {
    box-shadow: ${RING};
  }
  .inscribed-switch-input:disabled + .inscribed-switch {
    opacity: 0.5;
  }

  /* One picked entry in a tag list. */
  .inscribed-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px 3px 10px;
    border-radius: ${R_SM}px;
    border: 1px solid ${LINE};
    background: ${BG};
    font-size: ${FS_SM};
    line-height: 1.4;
    transition: background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-chip:hover {
    background: ${HOVER};
  }
  .inscribed-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: ${R_SM - 3}px;
    background: transparent;
    color: inherit;
    opacity: 0.45;
    cursor: pointer;
    transition: opacity ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE};
  }
  .inscribed-chip-remove:hover,
  .inscribed-chip-remove:focus-visible {
    opacity: 1;
    background: ${HOVER};
  }

  /* The clock pill wraps two inputs, so it lights from whichever has focus. */
  .inscribed-clock {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 3px 7px;
    border: 1px solid ${LINE};
    border-radius: ${R_SM}px;
    background: transparent;
    transition: background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, box-shadow ${DUR_FAST} ${EASE};
  }
  .inscribed-clock:hover {
    background-color: ${HOVER};
  }
  .inscribed-clock:focus-within {
    border-color: ${EDGE};
    box-shadow: ${RING};
  }
`;
