"use client";

/**
 * @file Row shell shared by the drawer's card lanes.
 *
 * Its own module rather than exports off `BlockCard`: the Collection lane loads
 * behind `next/dynamic`, and importing back into its loader would be a cycle.
 */

import { ChevronDown, Undo2, Lock, Languages, typeIconFor } from "../shared/style/icons.jsx";

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { blockResetStyle, rowActionsStyle, rowContainerStyle, rowHeaderStyle, rowGuideBodyStyle, srOnlyStyle, typeIconStyle, groupIconStyle } from "./drawer-styles.js";
import { ACCENT, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, FONT_SANS, FONT_MONO, dynamicSize } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse, BlockType } from "../shared/contracts/schemas.js"
 */

/**
 * Where a row sits relative to the list's left edge.
 *
 * A grouped row clears the group rail rather than starting to the left of it:
 * the rail is at x=12 (the folder glyph's centre) and the row's own fill used
 * to begin at 6, so every hover and every active ring painted straight over the
 * line meant to tie the row to its header. It starts at 14 now, and gives back
 * two of those pixels from its own left padding so the indent costs almost
 * nothing.
 *
 * @param {React.CSSProperties} base
 * @param {boolean} topLevel
 */
export function rowInsetStyle(base, topLevel) {
  return topLevel
    ? { ...base, paddingLeft: 6 }
    : { ...base, marginLeft: 14, paddingLeft: 4 };
}



// Disclosure rows (heavy blocks): the shared row shell, with a clickable header
// instead of an always-open editor. Only the pointer affordance is local; the
// geometry lives in the styles module so the changes preview matches it.
export const disclosureRowStyle = rowContainerStyle;

export const disclosureHeaderStyle = /** @type {React.CSSProperties} */ ({
  ...rowHeaderStyle,
  cursor: "pointer",
  userSelect: "none",
});

export const disclosureBodyStyle = rowGuideBodyStyle;

// The closed card's two lines: what the field is called, and what is in it.
//
// They used to share one line, the path taking the width and the value squeezed
// into a 45% tail behind it. That put the row's only piece of content in its
// smallest, faintest slot, so a page could not be read without opening every
// card on it. The path is the label now and the value is the line.
export const cardTextColStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

// Colour lives on `.inscribed-row-label` so the header's hover can lift it.
export const cardLabelStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontWeight: 500,
  fontSize: dynamicSize(11),
  lineHeight: 1.2,
  fontFamily: FONT_SANS,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// One label for every row in the Page tab, whichever lane draws it: a field
// row's caption, a closed card's, and the collection lane's. They were two
// objects that happened to look alike, and only one of them could be lifted on
// hover, because the other painted its colour inline.
//
// Sized from its own text rather than filling the row: the lane wraps it in the
// column that takes the slack, so the trailing controls still land on the edge.
export const fieldPathStyle = cardLabelStyle;

// Prose, so the sans, and the brightest thing in the row: it is the one part
// carrying content. Colour is on `.inscribed-card-preview`, same reason.
export const cardValueStyle = /** @type {React.CSSProperties} */ ({
  minWidth: 0,
  fontSize: dynamicSize(12.5),
  lineHeight: 1.3,
  fontFamily: FONT_SANS,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// A field nobody has filled in yet. Said in the panel's voice rather than left
// blank, so an empty card is distinguishable from one whose preview failed.
export const cardEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...cardValueStyle,
  color: TEXT_FAINT,
  fontStyle: "italic",
});

// The value line folds away when the card opens, since the editor below is then
// showing the same thing. `grid-rows` 0fr/1fr animates that with no measurement
// and no drawer-only CSS, the same way the repeatable's own rows collapse.
export const cardValueSlotStyle = /** @type {React.CSSProperties} */ ({
  display: "grid",
  transition: "grid-template-rows 220ms cubic-bezier(0.32, 0.72, 0.18, 1)",
});

export const cardValueClipStyle = /** @type {React.CSSProperties} */ ({
  overflow: "hidden",
  minHeight: 0,
});

/**
 * The row's one state signal, spent on the type glyph in the gutter (and, while
 * the row is open, read again by nothing: the guide below it stays neutral).
 *
 * It replaces three marks that used to say the same things in three places: a
 * dot beside the label, a lock in the trailing lane, and an accent ring around
 * the whole row. The gutter is where the eye already is, and a colour costs no
 * layout, so none of this resizes the label the way a mounting dot did.
 *
 * A collection row keeps its lane tint whether or not it is dirty: there the
 * colour is identity, not state.
 *
 * @param {{ isDirty?: boolean, isCollection?: boolean, readOnly?: boolean }} state
 */
export function rowTone({ isDirty, isCollection, readOnly }) {
  if (readOnly) return TEXT_FAINT;
  if (isCollection) return COLLECTION_ACCENT;
  return isDirty ? ACCENT : TEXT_MUTED;
}

/**
 * Block-type badge, the cue admins scan the list by. Shape carries the type;
 * colour carries the state (see `rowTone`), so per-type colours stay out of it
 * and the form doesn't turn into confetti.
 *
 * A locked row shows a padlock in place of its type glyph. The gutter is the
 * row's one state slot, and spending it on the more urgent of the two facts
 * frees the trailing lane entirely.
 *
 * @param {{ type: BlockType, compact?: boolean, tone?: string, readOnly?: boolean }} props
 */
export function TypeIcon({ type, compact, tone, readOnly }) {
  const Badge = readOnly ? Lock : typeIconFor(type);
  return (
    <span
      aria-hidden="true"
      style={compact
        ? { ...groupIconStyle, color: tone ?? TEXT_MUTED }
        : { ...typeIconStyle, color: tone ?? TEXT_MUTED }}
    >
      <Badge size={13} />
    </span>
  );
}

/**
 * Row class string: shares the form-row base (active ring) with `FieldRow`;
 * the collection variant swaps the ring tone. Dirty state is not here: it
 * travels on the type glyph (see `rowTone`).
 *
 * @param {{ isActive: boolean, isCollection: boolean }} args
 */
export function rowClassName({ isActive, isCollection }) {
  const parts = ["inscribed-field-row"];
  if (isCollection) parts.push("inscribed-field-row-collection");
  if (isActive) parts.push("is-active");
  return parts.join(" ");
}

/**
 * Shared header row for both lanes: glyph, label + value, then a fixed-width
 * action lane. Clicking it toggles the body; the reset button (only when dirty)
 * stops propagation so undo doesn't also toggle. `preview` (a one-line value
 * summary) shows only while closed, so a shut card still tells what's inside.
 *
 * @param {{
 *   block: BlockResponse,
 *   isOpen: boolean,
 *   isDirty: boolean,
 *   isCollection?: boolean,
 *   readOnly?: boolean,
 *   preview?: string | null,
 *   topLevel: boolean,
 *   displayPath?: string,
 *   onHeaderClick: () => void,
 *   onReset: () => void,
 * }} props
 */
export function CardHeader({
  block, isOpen, isDirty, isCollection, readOnly, preview,
  topLevel, displayPath, onHeaderClick, onReset, translating = false, onTranslate,
}) {
  const t = useCmsStrings();
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      className="inscribed-disclosure-header"
      style={disclosureHeaderStyle}
    >
      <TypeIcon
        type={block.blockType}
        compact={topLevel}
        readOnly={readOnly}
        tone={rowTone({ isDirty, isCollection, readOnly })}
      />

      <span style={cardTextColStyle}>
        <span className="inscribed-row-label" style={cardLabelStyle} title={block.blockPath}>
          {displayPath ?? block.blockPath}
        </span>
        {/* The glyph carrying these is `aria-hidden`, so they are said here
            instead. Colour is not an announcement. */}
        {isDirty ? <span style={srOnlyStyle}>{t("block.unsavedDot")}</span> : null}
        {readOnly ? <span style={srOnlyStyle}>{t("block.readOnly")}</span> : null}
        <span style={{ ...cardValueSlotStyle, gridTemplateRows: isOpen ? "0fr" : "1fr" }}>
          <span style={cardValueClipStyle} aria-hidden={isOpen}>
            {preview ? (
              <span className="inscribed-card-preview" style={cardValueStyle} title={preview}>
                {preview}
              </span>
            ) : (
              <span style={cardEmptyStyle}>{t("block.emptyValue")}</span>
            )}
          </span>
        </span>
      </span>

      <span style={rowActionsStyle}>
        {onTranslate ? (
          // Quiet until the row is hovered, holds a change or has the panel
          // open, since every row carries one (see `.inscribed-translate-btn`).
          <span
            role="button"
            tabIndex={0}
            aria-pressed={translating}
            onClick={(e) => { e.stopPropagation(); onTranslate(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onTranslate();
              }
            }}
            className={`inscribed-icon-button inscribed-translate-btn${isDirty ? " is-shown" : ""}`}
            style={translating ? { ...blockResetStyle, color: ACCENT } : blockResetStyle}
            aria-label={t("translations.editOthersLabel", { path: block.blockPath })}
            title={t("translations.editOthers")}
          >
            <Languages size={13} />
          </span>
        ) : null}
        {isDirty ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onReset();
              }
            }}
            className={`inscribed-icon-button${isCollection ? " inscribed-icon-button-collection" : ""}`}
            style={blockResetStyle}
            aria-label={t("block.undoThis")}
            title={t("block.undo")}
          >
            <Undo2 size={13} />
          </span>
        ) : null}

        <span
          className="inscribed-row-chevron"
          style={{
            display: "inline-flex",
            transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1), color 140ms ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDown size={13} />
        </span>
      </span>
    </button>
  );
}
