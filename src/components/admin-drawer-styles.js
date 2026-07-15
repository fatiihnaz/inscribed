/**
 * @file Visual tokens, style objects, and the inline CSS string for the
 * admin drawer. Refined direction:
 *
 *   - 4px spacing grid, Inter Tight headings + JetBrains Mono
 *   - explicit type ramp (textHi / text / textMid / textMuted / textFaint)
 *   - inset box-shadow as "borders" so the drawer can layer panes
 *     without hard 1px edges
 *   - block-type glyph badges replace the dekoratif grip
 *   - one status lane at the bottom absorbs the old save bar + header pill
 *   - draft accent (sage) on dirty, collection accent (pink-purple) on
 *     Collection lanes
 *
 * Old token names (BORDER_SOFT, TEXT_MUTED, etc.) are kept as aliases
 * so the editor/field surfaces that consume them stay valid while the
 * card-level visuals migrate.
 */

// ---------------------------------------------------------------------------
// Geometry + motion
// ---------------------------------------------------------------------------

export const PANEL_WIDTH = 460;
export const HANDLE_WIDTH = 22;
export const HANDLE_OVERLAP = 4;

export const PANEL_TRANSITION = {
  type: "tween",
  duration: 0.35,
  ease: [0.32, 0.72, 0.18, 1],
};

export const BODY_TRANSITION = {
  duration: 0.24,
  ease: [0.32, 0.72, 0.18, 1],
};

export const RADIUS = "var(--ins-radius, 10px)";
export const RADIUS_SM = "calc(var(--ins-radius, 10px) - 3px)";

// ---------------------------------------------------------------------------
// Design scale: internal, NOT themeable.
//
// These define the product's *shape* (corner steps, type ramp, motion), not its
// palette, so they stay out of the `theme` subset (which only recolors) and
// every surface snaps to the same vocabulary. The themeable RADIUS / RADIUS_SM
// above are the exception: hosts may legitimately want rounder/squarer cards.
// ---------------------------------------------------------------------------

// Radius steps for the inner chrome (badges, inputs, buttons, chips).
export const R_BADGE = 4;   // tiny tags / index badges
export const R_SM    = 6;   // inputs, dense controls
export const R_BTN   = 7;   // buttons
export const R_MD    = 8;   // single-field editors, nested cards
export const R_PILL  = 99;  // count chips, status pills

// Type ramp (px). One step per role: labels, metadata, body, headings.
export const FS_MICRO = 9;   // uppercase micro-labels / mode chips
export const FS_2XS   = 10;  // section labels
export const FS_XS    = 11;  // metadata, hints
export const FS_SM    = 12;  // default UI text / buttons
export const FS_MD    = 13;  // field input text

// Motion. One fast step for hovers/color swaps, one base step for layout.
export const DUR_FAST = "140ms";
export const DUR_BASE = "200ms";
export const EASE = "cubic-bezier(0.32, 0.72, 0.18, 1)";

// ---------------------------------------------------------------------------
// Tokens
//
// Every token resolves through a `--ins-*` CSS variable with the stock value
// baked in as the fallback, so the panel looks identical with no theme set.
// `createCmsConfig({ theme })` overrides a small subset of *bases*
// (--ins-accent, --ins-bg, --ins-surface, --ins-text, --ins-collection,
// --ins-danger, --ins-radius, fonts); the soft/line/ramp variants below are
// derived from those bases with `color-mix`, so overriding one base cascades
// to every tint built on it. See `lib/theme.js`.
// ---------------------------------------------------------------------------

// Surfaces. `--ins-bg` is the warm-dark base; raised/sunken shift from it so
// a custom bg carries the elevation shades along.
export const BG          = "var(--ins-bg, #1c1815)";
export const BG_RAISED   = "color-mix(in srgb, var(--ins-bg, #1c1815), #fff 5%)";
export const BG_SUNKEN   = "color-mix(in srgb, var(--ins-bg, #1c1815), #000 6%)";

// Elevation overlays + borders mix from `--ins-surface` (default white), so
// they keep resolving to the original white-alpha values until overridden.
export const SURFACE_1   = "color-mix(in srgb, var(--ins-surface, #fff) 2.5%, transparent)";
export const SURFACE_2   = "color-mix(in srgb, var(--ins-surface, #fff) 5%, transparent)";
export const SURFACE_3   = "color-mix(in srgb, var(--ins-surface, #fff) 8%, transparent)";
export const HAIRLINE    = "color-mix(in srgb, var(--ins-surface, #fff) 6%, transparent)";
export const BORDER      = "color-mix(in srgb, var(--ins-surface, #fff) 10%, transparent)";
export const BORDER_HI   = "color-mix(in srgb, var(--ins-surface, #fff) 18%, transparent)";
export const BORDER_FOCUS= "color-mix(in srgb, var(--ins-surface, #fff) 30%, transparent)";

// Text ramp mixes from `--ins-text` (default white).
export const TEXT_HI       = "color-mix(in srgb, var(--ins-text, #fff) 96%, transparent)";
export const TEXT          = "color-mix(in srgb, var(--ins-text, #fff) 82%, transparent)";
export const TEXT_MID      = "color-mix(in srgb, var(--ins-text, #fff) 58%, transparent)";
export const TEXT_MUTED    = "color-mix(in srgb, var(--ins-text, #fff) 38%, transparent)";
export const TEXT_FAINT    = "color-mix(in srgb, var(--ins-text, #fff) 22%, transparent)";

// Accents. Soft/line tints derive from the base accent vars.
export const ACCENT        = "var(--ins-accent, #c9b896)";
export const ACCENT_SOFT   = "color-mix(in srgb, var(--ins-accent, #c9b896) 14%, transparent)";
export const ACCENT_LINE   = "color-mix(in srgb, var(--ins-accent, #c9b896) 30%, transparent)";

// Horizontal outward reach of a block-level EditableRegion's roomy card. A
// CmsGroup outline must clear this to actually enclose its children.
export const ROOMY_INSET   = 10;

export const COLLECTION_ACCENT = "var(--ins-collection, rgb(220, 195, 225))";
export const COLLECTION_SOFT   = "color-mix(in srgb, var(--ins-collection, rgb(220,195,225)) 10%, transparent)";
export const COLLECTION_LINE   = "color-mix(in srgb, var(--ins-collection, rgb(220,195,225)) 30%, transparent)";

// Status. Danger is themeable; ok/warn stay fixed (semantic, rarely rebranded).
export const STATUS_OK     = "rgb(150, 210, 160)";
export const STATUS_WARN   = "rgb(232, 192, 130)";
export const STATUS_DANGER = "var(--ins-danger, rgb(232, 132, 152))";
export const STATUS_SAVED  = STATUS_OK;
export const STATUS_FAILED = STATUS_DANGER;

// Typography
export const FONT_SANS = 'var(--ins-font-sans, "Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)';
export const FONT_MONO = 'var(--ins-font-mono, "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace)';

// ---------------------------------------------------------------------------
// Legacy aliases, consumed by surfaces that didn't migrate to the new tokens.
// ---------------------------------------------------------------------------

export const PRIMARY_700   = BG_SUNKEN;
export const PRIMARY_600   = BG_RAISED;
export const PRIMARY_500   = BG;
export const BORDER_SOFT   = HAIRLINE;
export const BORDER_STRONG = BORDER_HI;
export const TEXT_PRIMARY  = TEXT_HI;
export const TEXT_SECONDARY= TEXT;

// ---------------------------------------------------------------------------
// Block-type metadata (glyph + accent). Drives the TypeIcon badge and the
// type label on each block card header.
// ---------------------------------------------------------------------------

/** @type {Record<string, { glyph: string, color: string, label: string }>} */
export const TYPE_META = {
  Text:       { glyph: "Aa", color: "rgb(186, 204, 230)", label: "Text" },
  ShortText:  { glyph: "Aa", color: "rgb(186, 204, 230)", label: "Short" },
  LongText:   { glyph: "≡a", color: "rgb(186, 204, 230)", label: "Long" },
  RichText:   { glyph: "¶", color: "rgb(208, 192, 230)", label: "Rich" },
  Image:      { glyph: "▢", color: "rgb(174, 218, 184)", label: "Image" },
  Link:       { glyph: "↗", color: "rgb(228, 204, 164)", label: "Link" },
  Date:       { glyph: "◷", color: "rgb(184, 222, 214)", label: "Date" },
  List:       { glyph: "≡", color: "rgb(222, 204, 174)", label: "List" },
  Collection: { glyph: "◫", color: COLLECTION_ACCENT, label: "Item" },
};

// Legacy alias: TYPE_STYLES had { color, bg, ring, label } per type.
// Derived from TYPE_META so the two stay in lock-step.
/** @type {Record<string, { color: string, bg: string, ring: string, label: string }>} */
export const TYPE_STYLES = Object.fromEntries(
  Object.entries(TYPE_META).map(([k, m]) => [
    k,
    {
      color: m.color,
      bg: tintFromColor(m.color, 0.1),
      ring: tintFromColor(m.color, 0.22),
      label: m.label,
    },
  ]),
);

/**
 * Turn a colour into a translucent tint: `rgba(..., a)` for plain `rgb(...)`
 * literals, else `color-mix` (so `var(--ins-*)` accent tokens still track a
 * themed base colour).
 *
 * @param {string} color
 * @param {number} alpha   0..1
 */
function tintFromColor(color, alpha) {
  const match = /^rgb\(([^)]+)\)$/i.exec(color);
  if (match) return `rgba(${match[1]}, ${alpha})`;
  return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
}

// 50% accent tint for dirty-dot glows (was the `${ACCENT}80` hex-alpha form,
// invalid now that ACCENT resolves through a `var(...)`).
export const ACCENT_GLOW = "color-mix(in srgb, var(--ins-accent, #c9b896) 50%, transparent)";

// ---------------------------------------------------------------------------
// Layout: panel shell
// ---------------------------------------------------------------------------

export const panelStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: PANEL_WIDTH,
  background: BG,
  color: TEXT_HI,
  zIndex: 9998,
  font: `13px/1.55 ${FONT_SANS}`,
  letterSpacing: "-0.005em",
  fontFeatureSettings: '"ss01", "cv11"',
  boxShadow: "0 0 40px rgba(0,0,0,0.35)",
};

export const paneContainerStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const paneStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export const headerStyle = {
  padding: "18px 20px 14px",
  borderBottom: `1px solid ${HAIRLINE}`,
};

export const breadcrumbStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 4,
  font: `11px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
  marginBottom: 10,
  letterSpacing: "0.01em",
};

export const breadcrumbHomeStyle = {
  color: TEXT_MUTED,
};

export const breadcrumbSepStyle = {
  color: TEXT_FAINT,
};

export const breadcrumbCurrentStyle = {
  color: TEXT,
  fontWeight: 500,
};

export const breadcrumbInactiveStyle = {
  color: TEXT_MUTED,
};

export const breadcrumbItemWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

export const titleBarStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
};

export const pageTitleStyle = {
  margin: 0,
  flex: 1,
  fontSize: 20,
  lineHeight: 1.15,
  letterSpacing: "-0.022em",
  fontWeight: 600,
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Mini "İZLENİYOR / DÜZENLENİYOR" mode chip. Replaces the loud status
// pill from the original.
export const modeChipStyle = {
  font: `9.5px/1 ${FONT_MONO}`,
  letterSpacing: "0.12em",
  color: TEXT_FAINT,
  padding: "4px 7px",
  borderRadius: R_BADGE,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  flexShrink: 0,
};

export const modeChipDirtyStyle = {
  color: ACCENT,
  background: ACCENT_SOFT,
  boxShadow: `inset 0 0 0 1px ${ACCENT_LINE}`,
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
  padding: "10px 10px",
  marginBottom: -1,
  background: "transparent",
  border: 0,
  borderBottom: "2px solid transparent",
  color: TEXT_MUTED,
  font: `500 12px/1 ${FONT_SANS}`,
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
  font: `500 10px/1 ${FONT_MONO}`,
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
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 6px ${ACCENT_GLOW}`,
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
  font: `12.5px/1 ${FONT_SANS}`,
  color: TEXT_HI,
  padding: 0,
  fontFamily: "inherit",
};

// Base color + background live on `.inscribed-search-clear` so the
// hover rule can swap them.
export const searchClearStyle = {
  border: 0,
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 2px",
};

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

export const groupCardStyle = {
  background: "transparent",
  overflow: "hidden",
};

export const groupHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 4px 6px 6px",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: TEXT,
  textAlign: "left",
};

export const groupNameStyle = {
  flex: 1,
  font: `600 10.5px/1 ${FONT_MONO}`,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: TEXT_MID,
};

export const groupCountStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  font: `500 10px/1 ${FONT_MONO}`,
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

export const groupBodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingTop: 4,
  paddingBottom: 4,
};

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

export const sectionLabelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px 6px",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: TEXT_FAINT,
  fontWeight: 600,
};

export const sectionLabelCountStyle = {
  fontFamily: FONT_MONO,
  letterSpacing: 0,
  textTransform: "none",
  fontSize: 10,
  color: TEXT_FAINT,
  background: SURFACE_2,
  padding: "1px 6px",
  borderRadius: R_PILL,
  fontWeight: 500,
};

export const listStyle = {
  flex: 1,
  margin: 0,
  padding: "6px 16px 16px",
  listStyle: "none",
  overflowY: "auto",
  scrollbarWidth: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

// ---------------------------------------------------------------------------
// Block card
// ---------------------------------------------------------------------------

// Base structure only. Surface fill, border, hover, dirty rail, and active
// accents live on the `.inscribed-block-card` CSS class (see `panelCss`) so the
// variant classes can override them; inline styles would otherwise win.
export const blockCardStyle = {
  borderRadius: RADIUS,
  overflow: "hidden",
};

// `border: 0` is mandatory: this style is spread onto a <button>, and without
// it the browser's default button border paints dark lines around every card.
export const blockHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  background: "transparent",
  border: 0,
};

export const blockPathStyle = {
  flex: 1,
  font: `500 12px/1.2 ${FONT_MONO}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

export const blockTypeLabelStyle = {
  fontWeight: 500,
  fontSize: 9.5,
  lineHeight: 1,
  color: TEXT_FAINT,
  paddingLeft: 2,
};

export const blockBodyStyle = {
  padding: "12px 12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderTop: `1px solid ${HAIRLINE}`,
};

export const blockHintStyle = {
  margin: 0,
  fontSize: 11.5,
  color: TEXT_MUTED,
  lineHeight: 1.45,
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

// Type icon badge, coloured per block type via TYPE_META.
export const typeIconStyle = {
  flexShrink: 0,
  width: 24,
  height: 24,
  borderRadius: R_SM,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  font: `600 12px/1 ${FONT_MONO}`,
};

// Legacy typeChipStyle kept for any caller that still imports it.
export const typeChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  height: 18,
  padding: "0 7px",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  borderRadius: R_BADGE,
  textTransform: "uppercase",
  flexShrink: 0,
  background: ACCENT_SOFT,
  color: ACCENT,
  boxShadow: `inset 0 0 0 1px ${ACCENT_LINE}`,
};

// Legacy grip styles kept to avoid breaking older imports. No longer used
// by BlockCard but harmless to expose.
export const gripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 3px)",
  gridAutoRows: "3px",
  gap: 2,
  flexShrink: 0,
  alignSelf: "center",
};
export const gripDotStyle = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.15)",
  display: "block",
};

export const emptyStateStyle = {
  margin: "8px 16px",
  padding: 16,
  color: TEXT_FAINT,
  fontSize: 12,
  lineHeight: 1.55,
  border: `1px dashed ${BORDER}`,
  borderRadius: RADIUS,
  textAlign: "center",
};

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

export const statusBarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
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
  fontSize: 12,
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

export const statusTsStyle = {
  font: `11px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
  marginLeft: 6,
};

export const statusLabelStyle = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1,
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
  font: `500 ${FS_SM}px/1 ${FONT_SANS}`,
  cursor: "pointer",
  border: 0,
  fontFamily: "inherit",
};

export const btnPrimaryStyle = { ...buttonBaseStyle };
export const btnGhostStyle = { ...buttonBaseStyle };

// Shared input/field geometry. The themeable colour comes from the consumer
// (warm tokens for the inline editors, neutral grays for the portable
// CollectionFieldsForm); only the shape is shared here.
export const fieldBaseStyle = {
  font: "inherit",
  fontSize: FS_MD,
  padding: "9px 12px",
  borderRadius: R_MD,
  outline: "none",
};

// ---------------------------------------------------------------------------
// Legacy save-bar exports mapped onto the new status-bar visuals, so code
// paths still importing them keep working while components migrate.
// ---------------------------------------------------------------------------

export const panelFooterStyle = statusBarStyle;
export const dirtyInlineStyle = statusSignalStyle;
export const footerActionsStyle = statusActionsStyle;
export const iconActionStyle = {
  ...btnGhostStyle,
  padding: "7px 10px",
};
export const iconActionPrimaryStyle = btnPrimaryStyle;

// ---------------------------------------------------------------------------
// User footer
// ---------------------------------------------------------------------------

export const footerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px 12px",
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
  font: `700 10.5px/1 ${FONT_SANS}`,
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
  font: `500 12px/1.2 ${FONT_SANS}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const userEmailStyle = {
  font: `10px/1.2 ${FONT_MONO}`,
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
  fontSize: 12,
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

export const handleButtonStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  transform: `translateX(calc(100% - ${HANDLE_OVERLAP}px))`,
  width: HANDLE_WIDTH,
  height: "100%",
  background: BG_RAISED,
  border: 0,
  borderTop: `1px solid ${HAIRLINE}`,
  borderRight: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
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

  /* Block card: inset shadow as border. Base surface + ring set here so the
     dirty/active variants can override them (inline styles would otherwise win). */
  .inscribed-block-card {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: box-shadow 160ms ease, background 160ms ease;
  }
  .inscribed-block-card:hover { box-shadow: inset 0 0 0 1px ${BORDER}; }
  /* Collection lane cards (Page-tab Collection blocks + Region-tab item
     cards) keep a faint pink-purple ring in their idle state so the
     whole Collection lane reads as one visual family even before the
     user opens anything. Hover stays on the shared base rule so the dirty and
     active rules below still win on source order (a collection-specific :hover
     would beat them via specificity). */
  .inscribed-block-card.inscribed-block-card-collection {
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }
  .inscribed-block-card.is-dirty {
    box-shadow: inset 0 0 0 1px ${ACCENT_LINE}, inset 2px 0 0 ${ACCENT};
  }
  .inscribed-block-card.inscribed-block-card-collection.is-dirty {
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE}, inset 2px 0 0 ${COLLECTION_ACCENT};
  }
  /* Active rules use a compound selector to match the (0,2,0) specificity of
     .inscribed-block-card.is-dirty and come after it in source order, so an
     open + dirty card lands on the active accent instead of the dirty rail. */
  .inscribed-block-card.inscribed-block-card-active {
    box-shadow: inset 0 0 0 1px ${BORDER_HI}, inset 3px 0 0 ${ACCENT};
    background: ${SURFACE_2};
  }
  .inscribed-block-card.inscribed-block-card-collection-active {
    box-shadow: inset 0 0 0 1px ${BORDER_HI}, inset 3px 0 0 ${COLLECTION_ACCENT};
    background: ${SURFACE_2};
  }

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
    transform: translateX(var(--slide-x, 3px));
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

  /* Form inputs (used by editors + CollectionFieldsForm) */
  input.inscribed-field, textarea.inscribed-field, select.inscribed-field {
    transition: box-shadow 140ms ease, background-color 140ms ease;
  }
  input.inscribed-field:focus, textarea.inscribed-field:focus, select.inscribed-field:focus {
    background-color: ${SURFACE_2};
    box-shadow: inset 0 0 0 1px ${BORDER_FOCUS};
  }
  input.inscribed-field::placeholder, textarea.inscribed-field::placeholder {
    color: ${TEXT_FAINT};
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

  .inscribed-create-card { transition: background 140ms ease, box-shadow 140ms ease; }
`;