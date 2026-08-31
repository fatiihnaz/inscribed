/**
 * @file Style objects and the inline CSS string for the admin drawer:
 *
 *   - inset box-shadow as "borders" so the drawer can layer panes
 *     without hard 1px edges
 *   - one status lane at the bottom absorbs the old save bar + header pill
 *
 * Drawer-only. The design tokens these are built from live in
 * `shared/style/tokens.js`, which the page-side surfaces consume too.
 */

import {
  PANEL_W, HANDLE_WIDTH, HANDLE_OVERLAP, RAIL_WIDTH, RAIL_EDGE_RADIUS,
  COMPACT_QUERY,
  R_BADGE, R_SM, R_BTN, R_MD, R_PILL,
  FS_SM,
  DUR_BASE, EASE,
  BG, BG_RAIL, BG_RAISED, BG_SUNKEN,
  SURFACE_1, SURFACE_2, SURFACE_3,
  HAIRLINE, BORDER, BORDER_HI, BORDER_FOCUS,
  TEXT_HI, TEXT, TEXT_MID, TEXT_MUTED, TEXT_FAINT,
  ACCENT, ACCENT_SOFT, ACCENT_LINE, ACCENT_GLOW, FOCUS_RING,
  COLLECTION_ACCENT, COLLECTION_SOFT, COLLECTION_LINE,
  STATUS_WARN, STATUS_DANGER,
  FONT_SANS, FONT_MONO,
  TYPE_META, dynamicSize,
} from "../shared/style/tokens.js";

// ---------------------------------------------------------------------------
// Layout: panel shell
// ---------------------------------------------------------------------------

// Position and size live in `panelCss` under this class: docking is a
// breakpoint, and a style object would need a resize listener to express one.
export const PANEL_CLASS = "inscribed-panel";

export const panelStyle = {
  background: BG,
  color: TEXT_HI,
  zIndex: 9998,
  fontSize: dynamicSize(13),
  lineHeight: 1.55,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  fontFeatureSettings: '"ss01", "cv11"',
  boxShadow: "0 0 40px rgba(0,0,0,0.35)",
  // Row: [mode rail][pane column]. The handle is absolutely positioned, so it
  // stays out of this flow.
  display: "flex",
};

// Everything the drawer makes `inert` while closed. The handle stays outside
// it, since it is what reopens the panel. Whether it stacks or sits in a row
// follows the rail, so the geometry is in `panelCss`.
export const DRAWER_BODY_CLASS = "inscribed-drawer-body";

export const paneContainerStyle = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const srOnlyStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

// ---------------------------------------------------------------------------
// Mode rail
// ---------------------------------------------------------------------------

// Lies down below the wide shell, so both orientations live in `panelCss`.
export const RAIL_CLASS = "inscribed-rail";

export const railButtonStyle = {
  position: "relative",
  width: 38,
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: 0,
  borderRadius: R_MD,
  cursor: "pointer",
  padding: 0,
};

// Dirty marker on a rail icon, offset to the badge corner so it reads as a
// property of the mode rather than part of the glyph.
export const railDirtyDotStyle = {
  position: "absolute",
  top: 7,
  right: 7,
  width: 5,
  height: 5,
  borderRadius: "50%",
  boxShadow: `0 0 0 2px ${BG_RAIL}`,
};

// A custom panel's own count, in the dot's corner. A number needs a pill rather
// than a dot, and the ring is what keeps it legible over the glyph behind it.
// The fill is the panel's accent, which is expected to read against the dark
// rail the way the built-in accents do.
export const railBadgeStyle = {
  position: "absolute",
  top: 3,
  right: 2,
  minWidth: 14,
  height: 14,
  padding: "0 4px",
  boxSizing: "border-box",
  borderRadius: 99,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: dynamicSize(9),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  color: BG_RAIL,
  boxShadow: `0 0 0 2px ${BG_RAIL}`,
};

// A panel's icon is the host's own node, drawn into a box we size. The rule in
// `panelCss` is what makes an SVG fill it regardless of the width/height its
// author baked in, so one icon serves both the 17px rail and the 12px header.
export const panelIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

// Active-mode bar on the rail's outer edge. Rendered by the active button and
// animated between buttons with a framer `layoutId`, so switching modes slides
// it instead of snapping. Only the fill stays inline, since it is the panel's
// arbitrary accent; the edge it clings to turns with the rail.
export const RAIL_BAR_CLASS = "inscribed-rail-bar";

export const paneStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};


// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// One fixed-height row: mode badge, path, status pill. There is no separate
// title because the path's last segment already is one; a second line would
// print the same word twice.
export const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 40,
  boxSizing: "border-box",
  padding: "0 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
};

// Echoes the rail's active glyph, so the header restates the current area in
// the same language rather than with a heading.
// The fill and tint cross-fade while the glyph inside rolls over, so the badge
// changes area in one gesture rather than snapping colour under a moving icon.
export const headerBadgeStyle = {
  flexShrink: 0,
  width: 22,
  height: 22,
  borderRadius: R_SM,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  color: TEXT_MID,
  transition: `background ${DUR_BASE} ${EASE}, color ${DUR_BASE} ${EASE}`,
};

export const headerBadgeCollectionStyle = {
  background: COLLECTION_SOFT,
  color: COLLECTION_ACCENT,
};

// Never wraps: a deep path collapses its middle instead of growing the header,
// so the row's height is independent of how far down the tree the user is.
// Sans, not mono: this row is navigation, not an identifier. Mono here (plus a
// `~` root) made the header read as a terminal prompt.
export const headerPathStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 3,
  fontWeight: 500,
  fontSize: dynamicSize(12),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "-0.005em",
  overflow: "hidden",
};

export const headerCrumbStyle = {
  flexShrink: 0,
  padding: "3px 5px",
  borderRadius: 4,
  border: 0,
  background: "transparent",
  font: "inherit",
  fontFamily: "inherit",
  color: TEXT_MUTED,
  cursor: "pointer",
};

// The segment the user is on. It separates by colour alone, inheriting the
// row's size and weight: at 13/600 against the row's 12/500 it read as a
// heading that had wandered into the path. Still the only part allowed to
// shrink, since it can be arbitrarily long.
export const headerCrumbCurrentStyle = {
  minWidth: 0,
  // Left padding matches a crumb button's, so the separator sits the same
  // distance from the text on both sides.
  padding: "3px 4px",
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const headerSepStyle = {
  flexShrink: 0,
  color: TEXT_FAINT,
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const tabBarStyle = {
  display: "flex",
  alignItems: "stretch",
  gap: 2,
  padding: "0 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
  position: "relative",
};

export const tabBarScrollStyle = {
  display: "flex",
  gap: 2,
  flex: 1,
  overflowX: "auto",
  scrollBehavior: "smooth",
};

export const tabBarChevronStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  marginBottom: -1,
  background: "transparent",
  border: 0,
  color: TEXT_MUTED,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  flexShrink: 0,
};

export const tabButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  // Fixed height so a tab strip without count badges (the collection switcher)
  // matches one with them (the page tabs): the badge is 4px taller than a bare
  // label, which otherwise made the two strips different heights.
  boxSizing: "border-box",
  minHeight: 32,
  padding: "7px 10px",
  marginBottom: -1,
  background: "transparent",
  border: 0,
  borderBottom: "2px solid transparent",
  color: TEXT_MUTED,
  fontWeight: 500,
  fontSize: dynamicSize(12),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  cursor: "pointer",
  transition: "color 140ms ease, border-color 140ms ease",
  fontFamily: "inherit",
  letterSpacing: 0,
};

export const tabButtonActiveStyle = {
  color: TEXT_HI,
};

export const tabLabelStyle = {
  letterSpacing: "-0.005em",
};

export const tabCountBadgeStyle = {
  fontWeight: 500,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  padding: "3px 6px",
  borderRadius: R_PILL,
  background: SURFACE_2,
  color: TEXT_FAINT,
};

export const tabCountBadgeActiveStyle = {
  color: TEXT_MID,
  background: SURFACE_3,
};

export const tabDirtyDotStyle = {
  flexShrink: 0,
  width: 4,
  height: 4,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 4px ${ACCENT_GLOW}`,
  marginLeft: -2,
};

// ---------------------------------------------------------------------------
// Toolbar (search)
// ---------------------------------------------------------------------------

export const toolbarStyle = {
  padding: "10px 16px 6px",
};

// Base background + box-shadow set in CSS (`.inscribed-search`) so the
// `:focus-within` rule can swap them.
export const searchWrapStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  height: 30,
  borderRadius: R_BTN,
};

export const searchInputStyle = {
  flex: 1,
  background: "transparent",
  border: 0,
  outline: 0,
  fontSize: dynamicSize(12.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  color: TEXT_HI,
  padding: 0,
  fontFamily: "inherit",
};

// Base color + background live on `.inscribed-search-clear` so the
// hover rule can swap them.
export const searchClearStyle = {
  border: 0,
  cursor: "pointer",
  fontSize: dynamicSize(16),
  lineHeight: 1,
  padding: "0 2px",
};

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

// No `overflow: hidden`: the collapsing body clips its own height animation,
// and a clip here would cut the header's focus ring off at the card's edge.
export const groupCardStyle = {
  background: "transparent",
};

export const groupHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 4px 6px 6px",
  border: 0,
  cursor: "pointer",
  color: TEXT,
  textAlign: "left",
};

// The name is the block path's prefix (`hero.title` -> `hero`), so it stays an
// identifier: same mono and weight as the child rows, separated from them by one
// size step and one tone step only. The folder glyph already says "group", so
// the type doesn't need bold or full-brightness to carry it.
export const groupNameStyle = {
  flex: 1,
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(12),
  lineHeight: 1,
  fontFamily: FONT_MONO,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const groupIconStyle = {
  flexShrink: 0,
  display: "inline-flex",
  color: TEXT_MUTED,
};

export const groupCountStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 500,
  fontSize: dynamicSize(10),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  padding: "2px 6px",
  borderRadius: R_PILL,
  background: SURFACE_2,
  color: TEXT_FAINT,
  fontWeight: 500,
};

export const groupDirtyDotStyle = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 5px ${ACCENT_GLOW}`,
};

// Wider gap than the old card stack: always-open field rows need air between
// label/editor pairs to read as separate fields.
export const groupBodyStyle = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  paddingTop: 4,
  paddingBottom: 8,
};

// Group spine: a hairline living in the rows' existing left padding (the gutter
// left of the type-icon column), so it ties the children to the header without
// indenting them. Absolute on purpose: children keep their own editor rails, so
// nothing double-indents. `left` matches the header label's left edge (its 6px
// padding) so the line drops straight from under the group name.
export const groupRailStyle = {
  position: "absolute",
  left: 6,
  top: 2,
  bottom: 6,
  width: 1,
  background: HAIRLINE,
  borderRadius: 1,
  pointerEvents: "none",
};

// Closes a group in the flat list: a full-width rule shown after a group when
// another block follows, so the group's bottom edge (and where the next block
// starts) reads at a glance. Slightly stronger than the row hairlines on
// purpose: a group boundary outranks a row divider.
export const groupDividerStyle = {
  listStyle: "none",
  height: 1,
  margin: 0,
  background: BORDER,
};

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

export const listStyle = {
  flex: 1,
  margin: 0,
  padding: "6px 16px 16px",
  listStyle: "none",
  overflowY: "auto",
  scrollbarWidth: "none",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

// ---------------------------------------------------------------------------
// Block card
// ---------------------------------------------------------------------------

// Base structure only. Surface fill, border, hover, dirty rail, and active
// accents live on the `.inscribed-block-card` CSS class (see `panelCss`) so the
// variant classes can override them; inline styles would otherwise win.
// ---------------------------------------------------------------------------
// Row language
//
// One definition for the drawer's core row shape, shared by the block list and
// the changes preview. They are exported rather than kept per-file precisely
// because the two drifted apart while each owned its own copy: the preview kept
// boxed cards, type-label chips and per-type glyph colours long after the block
// list dropped them.
// ---------------------------------------------------------------------------

// Outer container: no fill or border. Rows read as form flow, not as cards.
export const rowContainerStyle = {
  display: "flex",
  flexDirection: "column",
  padding: "6px 12px 6px",
  borderRadius: R_MD,
};

// Header line: glyph, identifier, trailing controls. `border: 0` is mandatory:
// this is spread onto a <button> in the block list, and without it the browser's
// default button border paints lines around every row.
export const rowHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 22,
  padding: 0,
  background: "transparent",
  border: 0,
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
};

// Body indented under the header by a hairline guide, centred beneath the
// glyph column, so an open row still reads as part of its header.
export const rowGuideBodyStyle = {
  margin: "4px 0 4px 9px",
  padding: "4px 0 6px 14px",
  borderLeft: `1px solid ${HAIRLINE}`,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

// The row's identifier (block path, collection key): a literal key, so mono.
export const rowPathStyle = {
  flex: 1,
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1.2,
  fontFamily: FONT_MONO,
  color: TEXT_MID,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const dirtyDotStyle = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 5px ${ACCENT_GLOW}`,
  flexShrink: 0,
};

// Base color + background live on `.inscribed-icon-button` so the
// hover rule can swap them.
export const blockResetStyle = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  border: 0,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

// Type icon badge, coloured per block type via TYPE_META. Row-scaled (20px)
// so it sits flush with the 11px mono labels of the form-row language.
export const typeIconStyle = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: R_BADGE,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: dynamicSize(11),
  lineHeight: 1,
  fontFamily: FONT_MONO,
};

// Legacy typeChipStyle kept for any caller that still imports it.
export const typeChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  height: 18,
  padding: "0 7px",
  fontSize: dynamicSize(10),
  fontWeight: 600,
  letterSpacing: "-0.005em",
  borderRadius: R_BADGE,
  flexShrink: 0,
  background: ACCENT_SOFT,
  color: ACCENT,
  boxShadow: `inset 0 0 0 1px ${ACCENT_LINE}`,
};

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

export const statusBarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  // Fixed height so the bar keeps a steady height whether or not the action
  // buttons are mounted. The button row (~27px) is taller than the idle status
  // line (~17px), so a content-driven height jumped ~10px on every dirty
  // toggle; alignItems centres both states into the same box instead. Sized to
  // the button plus a hair of breathing room: the controls keep their own
  // dimensions, the bar just stops padding around them.
  minHeight: 36,
  padding: "0 16px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_RAISED,
};

export const statusSignalStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: 1,
  minWidth: 0,
};

export const statusDotStyle = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: TEXT_FAINT,
  flexShrink: 0,
  transition: "background 200ms",
  display: "inline-block",
};

export const statusMsgStyle = {
  fontSize: dynamicSize(12),
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const statusMsgCleanStyle = {
  color: TEXT_MID,
};

export const statusMsgEmphasisStyle = {
  color: TEXT_HI,
  fontWeight: 600,
};

export const statusActionsStyle = {
  display: "flex",
  gap: 4,
  flexShrink: 0,
};

// Shared button geometry. Every button across the drawer (status-bar
// primary/ghost, the Collection CTAs in the editor/region panels, the List
// "+ Add") spreads this so they share one shape; colour / hover come from the
// per-variant CSS classes (inline styles would otherwise beat :hover).
export const buttonBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: R_BTN,
  fontWeight: 500,
  fontSize: FS_SM,
  lineHeight: 1,
  fontFamily: FONT_SANS,
  cursor: "pointer",
  border: 0,
  fontFamily: "inherit",
};

export const btnPrimaryStyle = { ...buttonBaseStyle };
export const btnGhostStyle = { ...buttonBaseStyle };

// ---------------------------------------------------------------------------
// Legacy save-bar exports mapped onto the new status-bar visuals, so code
// paths still importing them keep working while components migrate.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// User footer
// ---------------------------------------------------------------------------

export const footerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 16px 10px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_SUNKEN,
};

export const avatarStyle = {
  width: 26,
  height: 26,
  borderRadius: R_SM,
  overflow: "hidden",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: `linear-gradient(135deg, ${ACCENT}, #8a7a55)`,
  color: BG,
};

export const avatarImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export const avatarInitialsStyle = {
  fontWeight: 700,
  fontSize: dynamicSize(10.5),
  lineHeight: 1,
  fontFamily: FONT_SANS,
  letterSpacing: "0.02em",
};

export const userMetaStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

export const userNameStyle = {
  fontWeight: 500,
  fontSize: dynamicSize(12),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const userEmailStyle = {
  fontSize: dynamicSize(10.5),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Base color + background live on `.inscribed-logout` so the hover
// rule can swap them.
export const signOutButtonStyle = {
  width: 26,
  height: 26,
  border: 0,
  borderRadius: R_SM,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: 0,
};

// ---------------------------------------------------------------------------
// Error / conflict messages
// ---------------------------------------------------------------------------

export const errorStyle = {
  margin: "0 16px 8px",
  padding: "10px 12px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 28%, transparent)`,
  color: `color-mix(in srgb, ${STATUS_DANGER} 35%, #fff)`,
  borderRadius: R_MD,
  fontSize: dynamicSize(12),
  lineHeight: 1.5,
};

export const conflictStyle = {
  ...errorStyle,
  background: `color-mix(in srgb, ${STATUS_WARN} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_WARN} 28%, transparent)`,
  color: `color-mix(in srgb, ${STATUS_WARN} 35%, #fff)`,
};

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

// Which edge it clings to follows the shell, so that half sits in `panelCss`.
export const handleButtonStyle = {
  // Same content-box guard as the rail: the hairlines on the two long sides
  // would otherwise make the handle 2px bigger than the panel.
  boxSizing: "border-box",
  background: BG_RAISED,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

export const handleIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

// ---------------------------------------------------------------------------
// Inline CSS: hover/focus states, scrollbar styling, status pulse,
// dirty/active card variants, animation interpolation for height: auto.
// ---------------------------------------------------------------------------

export const panelCss = `
  /* Modern height-auto interpolation for body collapse animations. */
  @supports (interpolate-size: allow-keywords) {
    :root { interpolate-size: allow-keywords; }
  }

  /* A side column, at whatever width the breakpoints left in --ins-panel-w. */
  .${PANEL_CLASS} {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: ${PANEL_W};
  }
  .${PANEL_CLASS} > .inscribed-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: ${HANDLE_WIDTH}px;
    height: 100%;
    transform: translateX(calc(100% - ${HANDLE_OVERLAP}px));
    border: 0;
    border-top: 1px solid ${HAIRLINE};
    border-right: 1px solid ${HAIRLINE};
    border-bottom: 1px solid ${HAIRLINE};
    border-radius: 0 10px 10px 0;
  }

  .${DRAWER_BODY_CLASS} {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
  }

  .${RAIL_CLASS} {
    flex-shrink: 0;
    /* Required: nothing resets box-sizing here, so under the default
       content-box the padding would push the rail past the panel and take the
       rounded inner corners off-screen with it. */
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 4px;
    background: ${BG_RAIL};
    width: ${RAIL_WIDTH}px;
    height: 100%;
    flex-direction: column;
    /* Drops the first icon to the header's own top padding, so the rail starts
       on the same line as the breadcrumb instead of above it. */
    padding-top: 18px;
    border-right: 1px solid ${HAIRLINE};
    border-radius: 0 ${RAIL_EDGE_RADIUS}px ${RAIL_EDGE_RADIUS}px 0;
  }

  .${RAIL_BAR_CLASS} {
    position: absolute;
    left: -5px;
    top: 7px;
    bottom: 7px;
    width: 2px;
    border-radius: 1px;
    pointer-events: none;
  }

  /* Below the wide shell the panel is short of width in both bands, so the rail
     lies down across the top and hands the pane the whole of it. */
  @media ${COMPACT_QUERY} {
    .${DRAWER_BODY_CLASS} { flex-direction: column; }

    .${RAIL_CLASS} {
      width: 100%;
      height: auto;
      flex-direction: row;
      /* Lines the first icon up with the header badge under it. */
      padding: 5px 8px 5px 16px;
      border-right: 0;
      border-bottom: 1px solid ${HAIRLINE};
      border-radius: 0 0 ${RAIL_EDGE_RADIUS}px ${RAIL_EDGE_RADIUS}px;
    }

    .${RAIL_BAR_CLASS} {
      left: 7px;
      right: 7px;
      top: -5px;
      bottom: auto;
      width: auto;
      height: 2px;
    }
  }

  /* Nothing inside the panel hands its leftover scroll to the host page, so a
     pane scrolled to its end leaves the page where it was. The alternative is
     locking body overflow, which takes the host's scrollbar away and shifts its
     layout by that width. */
  .${PANEL_CLASS}, .${PANEL_CLASS} * {
    overscroll-behavior: contain;
  }

  .inscribed-rail-btn:focus-visible,
  .inscribed-tab:focus-visible,
  .inscribed-tabbar-chevron:focus-visible,
  .inscribed-crumb:focus-visible,
  .inscribed-group-header:focus-visible,
  .inscribed-disclosure-header:focus-visible,
  .inscribed-icon-button:focus-visible,
  .inscribed-text-button:focus-visible,
  .inscribed-load-more:focus-visible,
  .inscribed-create-row:focus-visible,
  .inscribed-collection-ref:focus-visible,
  .inscribed-pane-back:focus-visible,
  .inscribed-logout:focus-visible,
  .inscribed-search-clear:focus-visible,
  .inscribed-seg:focus-visible,
  .inscribed-btn-primary:focus-visible,
  .inscribed-btn-ghost:focus-visible,
  .inscribed-btn-collection:focus-visible,
  .inscribed-btn-collection-solid:focus-visible {
    outline: 1.5px solid ${FOCUS_RING};
    outline-offset: 1px;
  }

  /* Both of these live inside a clipping parent that has to stay clipped (the
     header path truncates, the tab strip scrolls), so their ring sits inside
     the control rather than around it. */
  .inscribed-crumb:focus-visible,
  .inscribed-tab:focus-visible {
    outline-offset: -1.5px;
    border-radius: ${R_SM}px;
  }

  /* The disclosure header carries no fill of its own, so it has no radius to
     inherit and the ring would draw square around it. */
  .inscribed-disclosure-header:focus-visible {
    border-radius: ${R_SM}px;
  }

  @keyframes inscribed-skeleton {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 1; }
  }
  .inscribed-skeleton {
    background: ${SURFACE_2};
    border-radius: ${R_BADGE}px;
    animation: inscribed-skeleton 1400ms ease-in-out infinite;
  }

  /* Framer's own animations are stood down by MotionConfig; this covers the
     CSS transitions and keyframes, and is scoped so no host style is touched. */
  @media (prefers-reduced-motion: reduce) {
    [class^="inscribed-"], [class*=" inscribed-"] {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }

  .inscribed-tabbar-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .inscribed-tabbar-scroll::-webkit-scrollbar { display: none; }

  .inscribed-tabbar-chevron {
    transition: color 120ms ease;
  }
  .inscribed-tabbar-chevron:hover:not(:disabled) { color: ${ACCENT}; }
  .inscribed-tabbar-chevron:disabled { opacity: 0; pointer-events: none; }

  .inscribed-tab:hover { color: ${TEXT}; }

  .inscribed-search {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: box-shadow 140ms ease, background 140ms ease;
  }
  .inscribed-search:focus-within {
    background: ${SURFACE_2};
    box-shadow: inset 0 0 0 1px ${BORDER_FOCUS};
  }
  .inscribed-search input::placeholder { color: ${TEXT_FAINT}; }
  .inscribed-search input[type="search"]::-webkit-search-cancel-button,
  .inscribed-search input[type="search"]::-webkit-search-decoration { display: none; }
  .inscribed-search-clear {
    background: transparent;
    color: ${TEXT_FAINT};
    transition: color 140ms ease;
  }
  .inscribed-search-clear:hover { color: ${TEXT}; }

  /* Body collapse: height 0 to auto via interpolate-size. */
  .inscribed-collapse {
    height: 0;
    overflow: hidden;
    transition: height 240ms cubic-bezier(0.32, 0.72, 0.18, 1);
  }
  .inscribed-collapse.is-open { height: auto; }

  /* Reset (Undo) icon-buttons */
  .inscribed-icon-button {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease, filter 140ms ease;
  }
  .inscribed-icon-button:hover:not(:disabled) {
    color: ${ACCENT};
    background-color: ${ACCENT_SOFT};
  }
  .inscribed-icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  /* Collection undo: hover tints with the collection accent */
  .inscribed-icon-button-collection:hover:not(:disabled) {
    color: ${COLLECTION_ACCENT};
    background-color: ${COLLECTION_SOFT};
  }

  /* Status bar buttons */
  .inscribed-btn-primary {
    background: ${TEXT_HI};
    color: ${BG};
    transition: background 140ms ease, color 140ms ease;
  }
  .inscribed-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ins-text, #fff) 78%, transparent); }
  .inscribed-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  
  /* Solid collection primary (status-bar "Aç"): soft pink fill derived from
     the collection accent so a rebrand carries through. */
  .inscribed-btn-collection-solid {
    background: color-mix(in srgb, ${COLLECTION_ACCENT} 88%, #fff);
    color: #241c25;
    transition: background 140ms ease;
  }
  .inscribed-btn-collection-solid:hover:not(:disabled) { background: color-mix(in srgb, ${COLLECTION_ACCENT} 78%, #fff); }
  .inscribed-btn-collection-solid:disabled { opacity: 0.5; cursor: not-allowed; }

  .inscribed-btn-ghost {
    background: transparent;
    color: ${TEXT_MID};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .inscribed-btn-ghost:hover:not(:disabled) {
    color: ${TEXT_HI};
    box-shadow: inset 0 0 0 1px ${BORDER};
    background: ${SURFACE_1};
  }
  .inscribed-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .inscribed-btn-collection {
    background: ${COLLECTION_SOFT};
    color: ${COLLECTION_ACCENT};
    box-shadow: inset 0 0 0 1px color-mix(in srgb, ${COLLECTION_ACCENT} 42%, transparent);
    transition: background 140ms ease, box-shadow 140ms ease;
  }
  .inscribed-btn-collection:hover:not(:disabled) {
    background: color-mix(in srgb, ${COLLECTION_ACCENT} 17%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, ${COLLECTION_ACCENT} 60%, transparent);
  }
  .inscribed-btn-collection:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Handle */
  .inscribed-handle {
    color: ${TEXT_MUTED};
    transition: color 200ms ease;
  }
  .inscribed-handle:focus-visible { outline: none; }
  .inscribed-handle:hover, .inscribed-handle:focus-visible { color: ${TEXT_HI}; }
  .inscribed-handle-slide {
    transition: transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1), filter 200ms ease;
    will-change: transform, filter;
  }
  .inscribed-handle:hover .inscribed-handle-slide,
  .inscribed-handle:focus-visible .inscribed-handle-slide {
    transform: translate(var(--slide-x, 0px), var(--slide-y, 0px));
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.55));
  }

  /* Sign-out */
  .inscribed-logout {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease;
  }
  .inscribed-logout:hover:not(:disabled) {
    color: ${STATUS_DANGER};
    background-color: color-mix(in srgb, ${STATUS_DANGER} 10%, transparent);
  }
  .inscribed-logout:disabled { opacity: 0.4; cursor: not-allowed; }


  .inscribed-slug-edit { transition: color 140ms ease; }
  .inscribed-slug-edit:focus-visible { outline: none; }
  .inscribed-slug-pencil { color: ${TEXT_FAINT}; transition: color 140ms ease; }
  .inscribed-slug-edit:hover:not(:disabled) .inscribed-slug-pencil,
  .inscribed-slug-edit:focus-visible .inscribed-slug-pencil { color: ${TEXT_MID}; }
  .inscribed-slug-edit:disabled { cursor: default; }
  .inscribed-slug-edit:disabled .inscribed-slug-pencil { opacity: 0.4; }

  .inscribed-slug-input {
    box-shadow: inset 0 -1px 0 ${COLLECTION_LINE};
    transition: box-shadow 140ms ease;
  }
  .inscribed-slug-input:focus {
    outline: none;
    box-shadow: inset 0 -1px 0 ${COLLECTION_ACCENT};
  }

  .inscribed-slug-icon {
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease;
  }
  .inscribed-slug-icon:focus-visible { outline: none; }
  .inscribed-slug-icon:hover:not(:disabled),
  .inscribed-slug-icon:focus-visible {
    color: ${TEXT_HI};
    background-color: ${SURFACE_2};
  }
  .inscribed-slug-icon:disabled { opacity: 0.4; cursor: default; }
  /* After the shared rules, so the confirm keeps its accent through both. */
  .inscribed-slug-icon-confirm:not(:disabled) { color: ${COLLECTION_ACCENT}; }
  .inscribed-slug-icon-confirm:not(:disabled):hover,
  .inscribed-slug-icon-confirm:focus-visible {
    color: ${COLLECTION_ACCENT};
    background-color: ${COLLECTION_SOFT};
  }

  ul[data-cms-list]::-webkit-scrollbar { display: none; }

  /* Status dot pulse for the saving state */
  @keyframes inscribed-status-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.45; }
  }
  .inscribed-status-pulse { animation: inscribed-status-pulse 1100ms ease-in-out infinite; }

  /* Load more / Create form / Region cards reuse these patterns. */
  .inscribed-load-more { transition: color 140ms ease, border-color 140ms ease, background 140ms ease; }
  .inscribed-load-more:hover:not(:disabled) {
    color: ${TEXT};
    border-color: ${BORDER_HI};
    background: ${SURFACE_1};
  }
  .inscribed-load-more:disabled { opacity: 0.5; cursor: progress; }

  .inscribed-text-button { transition: color 140ms ease, background-color 140ms ease; }
  .inscribed-text-button:hover:not(:disabled) {
    color: ${TEXT_HI};
    background-color: ${SURFACE_1};
  }
  .inscribed-text-button:disabled { opacity: 0.4; cursor: not-allowed; }


  /* Both collection lists: the collections landing, and one collection's
     records. One state machine for the two, because they are the same offer
     made twice and used to answer the pointer differently (a container's fill
     for one, a row's lighter lift for the other), which read as two kinds of
     list rather than two depths of one.

     The values are the form row's on purpose (see .inscribed-field-row): a
     record row and a block row put the same thing under the pointer, so they
     make the same mark. Rest states the transparent ring too, so the ring fades
     in with the fill instead of appearing whole. */
  .inscribed-listrow {
    background: transparent;
    box-shadow: inset 0 0 0 1px transparent;
    transition: background 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }
  /* Keyboard parity: the rows are buttons, and tabbing through them showed
     nothing but the chevron. The ring replaces the browser outline so the mark
     follows the row's own radius, and the pointer earns the same one: the row
     is one offer, and lighting it two ways would say it is two. */
  .inscribed-listrow:hover,
  .inscribed-listrow:focus-visible {
    outline: none;
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${BORDER};
  }
  /* Pressed. A nudge down rather than a scale: the row is text, and scaling it
     resamples every glyph for the length of the press. */
  .inscribed-listrow:active {
    background: ${SURFACE_2};
    transform: translateY(1px);
  }
  /* This row addresses the record currently selected on the page. The drawer's
     own collection card already marks that with an accent ring, so the list
     wears the same one and the page's selection reads as one mark across both
     surfaces rather than two conventions for the same fact. */
  .inscribed-listrow.is-active {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }

  /* A record row's second rank (its slug, its age). Faint enough at rest that
     the headline is what the eye lands on, readable once the row is the one
     being pointed at. */
  .inscribed-row-slug, .inscribed-row-age {
    color: ${TEXT_FAINT};
    transition: color 140ms ease;
  }
  .inscribed-listrow:hover .inscribed-row-slug,
  .inscribed-listrow:hover .inscribed-row-age,
  .inscribed-listrow:focus-visible .inscribed-row-slug,
  .inscribed-listrow:focus-visible .inscribed-row-age { color: ${TEXT_MUTED}; }

  /* The list marker a row wears in place of a thumbnail, where the collection
     declares no image. It lifts with the row's second rank, so the whole row
     answers the pointer as one thing. */
  .inscribed-row-mark {
    background: ${TEXT_FAINT};
    transition: background 140ms ease;
  }
  .inscribed-listrow:hover .inscribed-row-mark,
  .inscribed-listrow:focus-visible .inscribed-row-mark { background: ${TEXT_MUTED}; }

  /* Navigation chevron shared by both collection lists (the block list's own
     chevron is a disclosure that rotates, not this). Repeated down every row it
     stops being an affordance and turns into texture, so only the row being
     pointed at shows one. It keeps its space either way, so nothing shifts.

     Deliberately not shown on the active row: that row is marked already, and a
     chevron sitting on it permanently is the texture this rule avoids. */
  .inscribed-list-chevron {
    opacity: 0;
    transition: transform 200ms ${EASE}, color 140ms ease, opacity 140ms ease;
  }
  .inscribed-listrow:hover .inscribed-list-chevron,
  .inscribed-listrow:focus-visible .inscribed-list-chevron {
    opacity: 1;
    transform: translateX(4px);
    color: ${TEXT_MID};
  }

  /* The detail pane's translation chips. Both are buttons: one opens the
     record in another language, one composes it. They carried their fill and
     their colour inline, which outranks any rule, so neither answered the
     pointer at all and the strip read as a row of labels. */
  .inscribed-locale-chip {
    background: ${SURFACE_1};
    color: ${TEXT_MID};
    box-shadow: inset 0 0 0 1px transparent;
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }
  .inscribed-locale-chip:hover,
  .inscribed-locale-chip:focus-visible {
    outline: none;
    color: ${TEXT_HI};
    box-shadow: inset 0 0 0 1px ${BORDER_HI};
  }
  .inscribed-locale-chip:active { transform: translateY(1px); }

  /* The one that composes a language rather than opening one. It is a create
     action, so it spends the collection accent the way the "+ Yeni" row does.
     Listed after the base so its resting fill and its hover both win. */
  .inscribed-locale-chip-add {
    background: transparent;
    color: ${TEXT_FAINT};
    box-shadow: inset 0 0 0 1px ${BORDER};
  }
  .inscribed-locale-chip-add:hover,
  .inscribed-locale-chip-add:focus-visible {
    color: ${COLLECTION_ACCENT};
    background: ${COLLECTION_SOFT};
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }

  /* Collection toolbar chips. Named controls at a pill's shape: they replaced
     four unlabelled 24px squares, where the only way to know which one showed
     the archive was to have learned it. is-on is a toggle that is currently
     on (the archive), which is the one state a label alone cannot carry. */
  .inscribed-toolchip {
    background: transparent;
    color: ${TEXT_MID};
    box-shadow: inset 0 0 0 1px ${BORDER};
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }
  .inscribed-toolchip:hover:not(:disabled) {
    color: ${TEXT_HI};
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${BORDER_HI};
  }
  .inscribed-toolchip:focus-visible {
    outline: none;
    color: ${TEXT_HI};
    box-shadow: inset 0 0 0 1px ${BORDER_FOCUS};
  }
  .inscribed-toolchip:active:not(:disabled) { transform: translateY(1px); }
  .inscribed-toolchip.is-on,
  .inscribed-toolchip.is-on:hover {
    color: ${COLLECTION_ACCENT};
    background: ${COLLECTION_SOFT};
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }

  /* "+ Yeni": the list's primary action. Tinted at rest rather than only on
     hover, because a control that looks inert until pointed at is not what the
     one thing you came to do should look like. */
  .inscribed-create-row {
    color: ${COLLECTION_ACCENT};
    background: ${COLLECTION_SOFT};
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
    transition: background 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }
  .inscribed-create-row:hover {
    background: color-mix(in srgb, ${COLLECTION_ACCENT} 17%, transparent);
  }
  .inscribed-create-row:active { transform: translateY(1px); }

  /* Detail pane back button */
  .inscribed-pane-back {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease;
  }
  .inscribed-pane-back:hover { color: ${TEXT_HI}; background-color: ${SURFACE_2}; }

  /* Form rows: always-open fields AND heavy-block disclosure rows share this
     class. Active = the page region was clicked: a soft accent ring that
     follows the row's radius (a straight rail would get clipped square by the
     rounded corners). */
  .inscribed-field-row {
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .inscribed-field-row.is-active {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${ACCENT_LINE};
  }
  .inscribed-field-row-collection.is-active {
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }

  /* Hover affordance for the expandable headers. A group is a container, so its
     header takes a bg fill; a single block row is lighter, so it lifts its label
     + chevron colour instead. Those colours live here (not inline) so :hover
     wins, since an inline colour would beat a selector. */
  .inscribed-group-header {
    background: transparent;
    border-radius: ${R_SM}px;
    transition: background 140ms ease;
  }
  .inscribed-group-header:hover { background: ${SURFACE_2}; }

  .inscribed-row-label { color: ${TEXT_MID}; transition: color 140ms ease; }
  .inscribed-row-chevron { color: ${TEXT_MUTED}; }
  .inscribed-disclosure-header:hover .inscribed-row-label { color: ${TEXT}; }
  .inscribed-disclosure-header:hover .inscribed-row-chevron { color: ${TEXT}; }

  /* Mode rail. Active is carried by a bar on the rail's outer edge (not a fill
     alone) so the current mode stays legible at icon size. */
  /* No transform here: the indicator is a framer layout child measured against
     this box, so scaling the button mid-press would skew where it lands. */
  .inscribed-rail-btn {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background 140ms ease;
  }
  .inscribed-rail-btn:hover { color: ${TEXT}; background: ${SURFACE_1}; }
  .inscribed-rail-btn.is-active { color: ${TEXT_HI}; background: ${SURFACE_2}; }

  /* A custom panel's icon is the host's own node, and its author cannot know
     which box we will draw it into. Overriding the width/height attributes here
     lets one icon serve the 17px rail and the 12px header badge alike. */
  .inscribed-panel-icon > svg { width: 100%; height: 100%; }

  /* Header path: ancestors are real navigation, so they get a hover chip. The
     current segment is inert and deliberately has no hover. */
  .inscribed-crumb {
    transition: color 140ms ease, background 140ms ease;
  }
  .inscribed-crumb:hover { color: ${TEXT_HI}; background: ${SURFACE_1}; }

  /* Page-side collection reference rows: neutral at rest, collection-tinted on
     hover, matching the region panel's "+ Yeni" row. */
  .inscribed-collection-ref {
    background: transparent;
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: background 140ms ease, box-shadow 140ms ease;
  }
  .inscribed-collection-ref:hover {
    background: ${COLLECTION_SOFT};
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }

  /* Menu (the toolbar's sort/language pickers). The selected row keeps the
     collection accent on hover, so hovering never reads as reselecting. */
  .inscribed-menu-item:hover { background: ${SURFACE_1}; color: ${TEXT_HI}; }
  .inscribed-menu-item:focus-visible {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${BORDER};
  }
  .inscribed-menu-item[data-selected="true"]:hover { color: ${COLLECTION_ACCENT}; }

  /* Segmented language switch, used while the list is short enough to lay flat. */
  .inscribed-seg {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: background 140ms ease, color 140ms ease;
  }
  .inscribed-seg:hover:not([aria-pressed="true"]) { background: ${SURFACE_1}; color: ${TEXT_HI}; }
`;
