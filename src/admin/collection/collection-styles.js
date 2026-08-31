/**
 * @file Every style object and motion constant the collection panel draws with,
 * in one module because its surfaces share most of them: the locale chip is
 * worn by both the toolbar's language switch and the detail pane's translation
 * bar, the state chips by a list row and a pane header alike, and the save
 * button by the edit pane and the create pane.
 *
 * Values and objects only. The panel's CSS rules (hover, focus, press) still
 * live in `drawer-styles.js`'s `panelCss`, which is injected as one sheet in
 * one order; splitting them out would reorder them against the rules they sit
 * between, and this module already imports from there.
 */

import { buttonBaseStyle, btnGhostStyle, rowPathStyle } from "../drawer-styles.js";
import {
  BG, BG_RAISED, TEXT_HI, TEXT, TEXT_MID, TEXT_MUTED, TEXT_FAINT,
  COLLECTION_ACCENT, COLLECTION_SOFT, COLLECTION_LINE, STATUS_DANGER,
  BORDER, HAIRLINE, SURFACE_1, FONT_MONO, FONT_SANS,
  R_BADGE, R_MD, R_SM, R_BTN, R_PILL, dynamicSize,
} from "../../shared/style/tokens.js";

// Shared by the pane slide-in and the list's parallax counter-slide so the two
// layers move in lockstep. The pane enters from the LEFT (the drawer's own
// anchor edge, so depth reads as coming out of the panel), the list recedes
// right.
export const PANE_TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0.18, 1] };
// The pane's cast shadow reaches past its own right edge, so at x=-100% the
// slide reads as finished while the shadow still sits over the list, and the
// unmount snaps it away. Fading only the tail of the exit removes both together.
export const PANE_EXIT_TRANSITION = {
  ...PANE_TRANSITION,
  opacity: { duration: 0.12, delay: 0.18, ease: "linear" },
};
// How far the list layer recedes while a pane is open.
export const PARALLAX_SHIFT = "28%";

// A list arriving, as one block.
//
// Deliberately not a per-row cascade. The page size is 50 and "Load more"
// accumulates past that, so a staggered list would still be arriving seconds
// after it was asked for, and all but the first eight rows would be animating
// below the fold where nobody can see them. The same call `panel-motion.js`
// makes for a calendar's forty-two cells, for the same reason.
//
// One element rises, whatever it holds: the cost is flat in the number of rows.
export const LIST_RISE = 12;

export const LIST_ARRIVE_TRANSITION = { duration: 0.18, ease: [0.32, 0.72, 0.18, 1] };

// Leaving does not travel: the rows being replaced have already been decided
// against, and watching them slide out only delays what comes next.
export const LIST_LEAVE_TRANSITION = { duration: 0.1, ease: "linear" };

/**
 * Enter/exit props for a list block. Only a list of rows rises; the skeleton,
 * the empty states and the error box cross-fade in place, since a placeholder
 * that travels reads as content arriving twice.
 *
 * @param {boolean} rises
 */
export function listArrival(rises) {
  return {
    initial: rises ? { opacity: 0, y: LIST_RISE } : { opacity: 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: rises
      ? { ...LIST_ARRIVE_TRANSITION, exit: LIST_LEAVE_TRANSITION }
      : { ...LIST_LEAVE_TRANSITION, exit: LIST_LEAVE_TRANSITION },
  };
}

export const listLayerStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  // See `collectionsLayerStyle`: promoted so the recede animation composites
  // rather than repainting every row each frame.
  willChange: "transform, opacity",
});

export const regionScrollStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  paddingBottom: 16,
});

// Bare: these live inside the record card, which provides the frame. They used
// to draw their own bordered band under the pane header.
export const translationBarStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  gap: 4,
  alignItems: "center",
  flexWrap: "wrap",
});

// The toolbar's language switch, as one segmented pill so it sits in the chip
// strip rather than beside it as a pair of loose 9px tags. Its own frame, at
// the chip's height, with the segments inside it.
export const localeSwitchStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  height: 26,
  padding: "0 3px",
  borderRadius: R_PILL,
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  flexShrink: 0,
});

// The unselected halves. Deliberately without a `background`: the hover fill is
// a class rule, and an inline background (even `transparent`) outranks it.
export const localeSegStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  fontWeight: 600,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "0.05em",
  padding: "0 8px",
  borderRadius: R_PILL,
  border: 0,
  color: TEXT_MUTED,
  cursor: "pointer",
});

// The language currently being worked in. Its own object rather than the detail
// pane's chip: that one sits in a dense translation strip and is sized for it,
// and sharing it is what dragged this switch down to 9px.
export const localeSegOnStyle = /** @type {React.CSSProperties} */ ({
  ...localeSegStyle,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  cursor: "default",
});

export const localeChipBase = /** @type {React.CSSProperties} */ ({
  fontWeight: 600,
  fontSize: dynamicSize(9),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "0.05em",
  padding: "4px 7px",
  borderRadius: R_BADGE,
  border: 0,
});

export const localeChipCurrentStyle = /** @type {React.CSSProperties} */ ({
  ...localeChipBase,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
});

// Geometry only. Fill, colour and every state live on `.inscribed-locale-chip`
// (and `-add`) in `panelCss`: these are buttons, and an inline fill outranks the
// rule that would light them, which is what left the strip inert.
export const localeChipStyle = /** @type {React.CSSProperties} */ ({
  ...localeChipBase,
  cursor: "pointer",
});


export const sectionWrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 4,
});

export const regionHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  padding: "14px 16px 4px",
});

// Sentence case, matching the collections list's section headings: the drawer
// has one voice for labelling a group of rows, and it isn't tracked-out
// micro-caps.
export const regionAllLabelStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  color: TEXT_MUTED,
});

export const filterChipStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 7px",
  borderRadius: R_BADGE,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  fontWeight: 500,
  fontSize: dynamicSize(10.5),
  lineHeight: 1,
  fontFamily: FONT_MONO,
});

export const filterChipKeyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
});

export const filterChipValueStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MID,
});

export const regionCountStyle = /** @type {React.CSSProperties} */ ({
  marginLeft: "auto",
  fontWeight: 500,
  fontSize: dynamicSize(10.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  color: TEXT_FAINT,
});

// No box around the list and no rules between the rows: the drawer groups by
// spacing and rounded fills, never by frames. A bordered group with dividers is
// a table, and it read as one imported from somewhere else.
//
// The rows start at the panel's own 16px inset, same as the search field, the
// toolbar and the section header above them. A row's rounded edge is what has
// to land on that line; its text then sits further in, exactly as a block card
// does on the Page tab.
export const rowGroupStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
  padding: "0 16px",
});

// Two lines and a thumbnail, so the row is sized from what it holds rather
// than from the drawer's 32px control height. `boxSizing` is required, not
// tidiness: nothing resets it in the panel, so under content-box the min-height
// would stack on top of the padding.
//
// A grid, not a flex row: the thumbnail column has to hold its width whether or
// not this particular record filled the field in, and the state tags have to
// stay in one lane down the list. Both fall out of fixed tracks and neither
// falls out of `flex`.
export const rowStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "34px 1fr auto",
  alignItems: "center",
  gap: 11,
  width: "100%",
  minHeight: 50,
  padding: "8px 12px",
  border: 0,
  borderRadius: R_MD,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

// What leads a row in a collection that declares no image at all. Not a
// placeholder for a missing picture (there is no picture to miss) but a list
// marker: without it the text starts hard against the row's left edge and the
// rows read as a paragraph rather than as a list. Its colour lives on
// `.inscribed-row-mark` so the row's hover rule can lift it with the rest.
export const rowMarkStyle = /** @type {React.CSSProperties} */ ({
  justifySelf: "center",
  width: 8,
  height: 1,
  borderRadius: 1,
  flexShrink: 0,
});

export const thumbStyle = /** @type {React.CSSProperties} */ ({
  width: 34,
  height: 34,
  borderRadius: R_SM,
  overflow: "hidden",
  flexShrink: 0,
  // An inset ring rather than a border: a photo that happens to end in the
  // panel's own dark would otherwise dissolve into the row.
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  background: SURFACE_1,
});

export const thumbImgStyle = /** @type {React.CSSProperties} */ ({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
});

export const thumbEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...thumbStyle,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: TEXT_FAINT,
});

// The two text lines. Its own column so the tags beside it never ride on the
// title's width.
export const rowBodyStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

// The lead. Prose (a field value), at the size the eye is actually hunting on:
// two steps up from the 11px it used to share with its own slug.
export const rowTitleStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(13),
  lineHeight: 1.25,
  fontFamily: FONT_SANS,
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Fallback lead, for a schema with nothing textual to headline with: an
// identifier, so it keeps the block path's own family rather than being dressed
// up as prose.
export const rowSlugHeadlineStyle = /** @type {React.CSSProperties} */ ({
  ...rowPathStyle,
  flex: "0 1 auto",
  fontSize: dynamicSize(12.5),
});

// Line two: what addresses the record, not what it says.
export const rowMetaStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
});

// The slug yields; the age does not. A truncated slug still reads as an
// address, a truncated "12.08.2026" reads as nothing.
export const rowSlugStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const rowSepStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  color: TEXT_FAINT,
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
});

// Colour is on `.inscribed-row-age` (and `-slug`) so the row's hover rule can
// lift them; an inline colour would outrank the class.
export const rowAgeStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  fontWeight: 500,
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

// State tags and the chevron, in one lane down the right edge.
export const rowSideStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexShrink: 0,
});


export const searchBarStyle = /** @type {React.CSSProperties} */ ({
  padding: "10px 16px 6px",
  flexShrink: 0,
});

// `position: relative` anchors the sort menu. The toolbar sits outside the
// list's scroll box, so the panel can hang past it without being clipped.
export const toolbarStyle = /** @type {React.CSSProperties} */ ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 16px 8px",
  flexShrink: 0,
});


// Centres the arrow while it is mid-swap, when its own box is scaled down.
export const directionIconStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

// Toolbar chips. Named controls at a pill's shape, replacing four unlabelled
// 24px squares that asked the user to remember which glyph meant what.
//
// No inline `background`, `color` or `boxShadow`: rest, hover, press and the
// pressed-on state all live on `.inscribed-toolchip`, and an inline value of
// any of the three outranks the class.
export const toolChipStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 26,
  padding: "0 9px",
  border: 0,
  borderRadius: R_PILL,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
});

// The sort pair, joined on the edge they meet: two real buttons reading as the
// one control they are. The Menu's own trigger geometry is overridden here, so
// it sits at the chip's height rather than the 24px it uses elsewhere.
export const sortChipStyle = /** @type {React.CSSProperties} */ ({
  ...toolChipStyle,
  height: 26,
  padding: "0 7px 0 10px",
  borderRadius: `${R_PILL}px 0 0 ${R_PILL}px`,
});

export const directionChipStyle = /** @type {React.CSSProperties} */ ({
  ...toolChipStyle,
  justifyContent: "center",
  width: 26,
  padding: 0,
  borderRadius: `0 ${R_PILL}px ${R_PILL}px 0`,
  // A hairline where the two meet, so the pair reads as two presses rather than
  // one long pill.
  marginLeft: 1,
});

// A two-letter code is a short label, so it gets the tracking the segmented
// chips use rather than reading as a cramped word.
export const localeMenuTriggerStyle = /** @type {React.CSSProperties} */ ({
  ...toolChipStyle,
  letterSpacing: "0.04em",
});

export const searchScopeNoteStyle = /** @type {React.CSSProperties} */ ({
  padding: "2px 16px 0",
  fontSize: dynamicSize(10.5),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  color: TEXT_MUTED,
});

export const rowChevronStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  color: TEXT_FAINT,
  flexShrink: 0,
});

// One recipe for every state tag a record wears, in the row and in the detail
// header alike: the create lane's draft badge, minus its tint. They used to be
// two hand-rolled boxes at a radius (3) that exists nowhere else in the scale.
export const stateChipStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  fontWeight: 600,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  padding: "3px 6px",
  borderRadius: R_BADGE,
});

export const readonlyChipStyle = /** @type {React.CSSProperties} */ ({
  ...stateChipStyle,
  background: SURFACE_1,
  color: TEXT_MUTED,
});

// A tinted fill rather than red lettering on the neutral one: archived is a
// state, not an error, and the old pairing put the loudest colour in the row on
// its quietest surface.
export const archivedChipStyle = /** @type {React.CSSProperties} */ ({
  ...stateChipStyle,
  background: `color-mix(in srgb, ${STATUS_DANGER} 12%, transparent)`,
  color: STATUS_DANGER,
});

// The record carries unsaved work. Says it in a word rather than in the
// drawer's dirty dot: down a list, this tag has to be told apart from the
// read-only and archived ones beside it, and three dots would be a legend.
export const draftChipStyle = /** @type {React.CSSProperties} */ ({
  ...stateChipStyle,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
});

export const errorBoxStyle = /** @type {React.CSSProperties} */ ({
  margin: "0 16px 4px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, var(--ins-text, #fff))`,
  fontSize: dynamicSize(12),
  padding: "8px 10px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 8%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 25%, transparent)`,
  borderRadius: R_SM,
});

export const retryTextStyle = /** @type {React.CSSProperties} */ ({
  background: "transparent",
  color: TEXT_MUTED,
  border: 0,
  borderRadius: R_BADGE,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: dynamicSize(11),
  fontFamily: FONT_SANS,
});

export const loadMoreStyle = /** @type {React.CSSProperties} */ ({
  alignSelf: "center",
  margin: "4px auto 12px",
  padding: "7px 16px",
  background: "transparent",
  color: TEXT_MUTED,
  border: `1px solid ${BORDER}`,
  borderRadius: R_BTN,
  cursor: "pointer",
  fontSize: dynamicSize(12),
  fontFamily: FONT_SANS,
  fontFamily: FONT_SANS,
});

// -- Detail pane --

// No z-index on purpose: DOM order already stacks the pane above the list
// layer, and any z here would lift the pane over the drawer handle's 4px
// overlap at the panel edge (the handle must keep painting on top).
export const detailPaneStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: BG,
  // Right-edge hairline + soft cast shadow (the pane enters from the left):
  // separates the pane from the receding list layer while the two slide.
  boxShadow: `1px 0 0 ${HAIRLINE}, 16px 0 36px rgba(0, 0, 0, 0.35)`,
  willChange: "transform",
});

export const detailHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
  flexShrink: 0,
});

// Named rather than a lone chevron. The header carries no title now (the record
// card below it does), so there is room for the one word that says where back
// goes, and the pane's only navigation should not be a glyph to decode.
export const paneBackStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: 24,
  marginLeft: -6,
  padding: "0 8px 0 4px",
  borderRadius: R_SM,
  border: 0,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: dynamicSize(11.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  flexShrink: 0,
});

export const detailTitleStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const detailVersionStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_MONO,
  color: TEXT_MUTED,
  flexShrink: 0,
});

export const archiveNoticeStyle = /** @type {React.CSSProperties} */ ({
  fontSize: dynamicSize(11),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  color: TEXT_MUTED,
});

// One grid cell holding both states, stacked. Grid rather than a stack of
// absolutes so the cell still measures its content: the row keeps whichever
// state is taller and never resizes as they swap.
export const slugSlotStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  display: "grid",
  alignItems: "center",
});

export const slugCellStyle = /** @type {React.CSSProperties} */ ({
  gridArea: "1 / 1",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
});

// The heading is the control, so the button carries none of a button's chrome:
// no background, no border, no padding. What it adds is the hit area and the
// keyboard focus the slug needs to be pressable at all.
export const slugButtonStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: 0,
  border: 0,
  background: "none",
  color: "inherit",
  textAlign: "left",
});

// Sized to its content rather than to the row, so the pencil that follows sits
// against the end of the slug instead of drifting to the far edge.
export const slugTextStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Colour comes from the stylesheet so hover and focus can move it; only the
// layout belongs here.
export const slugPencilStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
});

// The heading's own metrics, and deliberately no padding or border: the header's
// height comes from the 24px back button, and anything taller here would move
// the row the moment editing opened. The underline is an inset shadow for the
// same reason, since a real border occupies a pixel; it lives in the stylesheet
// so focus can take it over.
export const slugInputStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(12.5),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  color: TEXT,
  padding: 0,
  border: 0,
  background: "transparent",
});

export const slugIconButtonStyle = /** @type {React.CSSProperties} */ ({
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: 0,
  background: "none",
  borderRadius: R_SM,
  cursor: "pointer",
  flexShrink: 0,
});

// The notices below sit in the pane's subhead, between the header and the
// record's fields, so they carry the header's own gutter rather than a card of
// their own.
export const renameErrorStyle = /** @type {React.CSSProperties} */ ({
  fontSize: dynamicSize(11),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, #fff)`,
  padding: "7px 16px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
});

export const renameWarningStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: dynamicSize(11),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, #fff)`,
  padding: "7px 16px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
});

export const renameConfirmStyle = /** @type {React.CSSProperties} */ ({
  ...btnGhostStyle,
  flexShrink: 0,
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, #fff)`,
});

// The record's own header block: what it is, above what addresses it. A framed
// card rather than another band of the pane's chrome, because it is the record
// rather than the panel talking.
export const recordCardStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  margin: "10px 16px 0",
  padding: 12,
  borderRadius: R_MD,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  flexShrink: 0,
});

export const recordThumbStyle = /** @type {React.CSSProperties} */ ({
  width: 46,
  height: 46,
  borderRadius: R_SM,
  overflow: "hidden",
  flexShrink: 0,
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  background: SURFACE_1,
});

export const recordThumbEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...recordThumbStyle,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: TEXT_FAINT,
});

export const recordBodyStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

export const recordTitleStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(15),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.01em",
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Nothing typed in the title field yet. Still a heading, just not the record's
// own words, so it says so in the panel's voice rather than borrowing the slug.
export const recordTitleEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...recordTitleStyle,
  color: TEXT_MUTED,
  fontStyle: "italic",
});

// Address, state and age on one line under the title.
export const recordSubStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  color: TEXT_MUTED,
});

export const recordSepStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  color: TEXT_FAINT,
});

export const recordStateStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexShrink: 0,
  color: COLLECTION_ACCENT,
});

export const recordDotStyle = /** @type {React.CSSProperties} */ ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: COLLECTION_ACCENT,
  boxShadow: `0 0 5px color-mix(in srgb, ${COLLECTION_ACCENT} 50%, transparent)`,
});

export const recordChipRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  minWidth: 0,
});

export const detailBodyStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
  padding: "14px 16px 16px",
});

export const detailFooterStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_RAISED,
  flexShrink: 0,
});

export const saveButtonStyle = /** @type {React.CSSProperties} */ ({
  ...buttonBaseStyle,
  fontWeight: 600,
});

// -- Create lane --

export const createBarStyle = /** @type {React.CSSProperties} */ ({
  padding: "0 16px 8px",
  flexShrink: 0,
});

// The screen's primary action, so it looks like one: centred, at a button's
// height, wearing the collection accent at rest instead of only on hover. It
// used to be a left-aligned hairline row, which is the shape this panel gives
// to things you navigate into, not things you do.
//
// Colour, fill and every state live on `.inscribed-create-row`; an inline
// `background` or `color` here would outrank the class.
export const createButtonStyle = /** @type {React.CSSProperties} */ ({
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  width: "100%",
  // The search field's own height. They are the two full-width controls stacked
  // at the top of the list, and a button a step taller than the box above it
  // reads as a mistake rather than as emphasis.
  minHeight: 30,
  padding: "0 12px",
  border: 0,
  borderRadius: R_BTN,
  fontWeight: 500,
  fontSize: dynamicSize(12.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  cursor: "pointer",
});

export const draftBadgeStyle = /** @type {React.CSSProperties} */ ({
  fontWeight: 600,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  padding: "3px 6px",
  borderRadius: R_BADGE,
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
  boxShadow: `inset 0 0 0 1px ${COLLECTION_LINE}`,
  flexShrink: 0,
});

export const createFormWrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

export const errorInlineStyle = /** @type {React.CSSProperties} */ ({
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, var(--ins-text, #fff))`,
  fontSize: dynamicSize(12),
  padding: "8px 10px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 30%, transparent)`,
  borderRadius: R_SM,
});
