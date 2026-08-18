"use client";

/**
 * @file Row shell shared by the drawer's card lanes: the disclosure geometry,
 * the type badge, and the clickable header.
 *
 * Its own module rather than exports off `BlockCard`, because the Collection
 * lane loads behind `next/dynamic` and importing back into its loader would
 * put the two files in a cycle.
 */

import { ChevronDown, Undo2, Lock, typeIconFor } from "../shared/style/icons.jsx";

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { blockResetStyle, dirtyDotStyle, rowContainerStyle, rowHeaderStyle, rowGuideBodyStyle, rowPathStyle, typeIconStyle, groupIconStyle } from "./drawer-styles.js";
import { TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, FONT_SANS } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse, BlockType } from "../shared/contracts/schemas.js"
 */

/**
 * @param {React.CSSProperties} base
 * @param {boolean} topLevel
 */
export function rowInsetStyle(base, topLevel) {
  return topLevel
    ? { ...base, paddingLeft: 6 }
    : { ...base, marginLeft: 6, paddingLeft: 6 };
}

export const fieldPathStyle = rowPathStyle;

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

export const cardPreviewStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  maxWidth: "45%",
  font: `11px/1.2 ${FONT_SANS}`,
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/**
 * Block-type badge, the cue admins scan the list by. Monochrome on purpose:
 * every row carries one, so per-type colours would turn the form into confetti;
 * the shape alone does the telling.
 *
 * @param {{ type: BlockType, compact?: boolean }} props
 */
export function TypeIcon({ type, compact }) {
  const Badge = typeIconFor(type);
  return (
    <span
      aria-hidden="true"
      style={compact ? groupIconStyle : { ...typeIconStyle, color: TEXT_MUTED }}
    >
      <Badge size={13} />
    </span>
  );
}

/**
 * Row class string: shares the form-row base (active ring) with `FieldRow`;
 * the collection variant swaps the ring tone. Dirty state travels on the
 * header dot, not the container.
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
 * Shared header row for both lanes. Clicking it toggles the body; the reset
 * button (only when dirty) stops propagation so undo doesn't also toggle.
 * `preview` (a one-line value summary) shows only while closed, so a shut
 * card still tells what's inside.
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
export function CardHeader({ block, isOpen, isDirty, isCollection, readOnly, preview, topLevel, displayPath, onHeaderClick, onReset }) {
  const t = useCmsStrings();
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      className="inscribed-disclosure-header"
      style={disclosureHeaderStyle}
    >
      <TypeIcon type={block.blockType} compact={topLevel} />
      <span className="inscribed-row-label" style={{ ...fieldPathStyle, color: undefined }} title={block.blockPath}>
        {displayPath ?? block.blockPath}
      </span>

      {!isOpen && preview ? (
        <span style={cardPreviewStyle} title={preview}>{preview}</span>
      ) : null}

      {isDirty ? (
        <span
          style={isCollection ? { ...dirtyDotStyle, background: COLLECTION_ACCENT, boxShadow: `0 0 5px ${COLLECTION_ACCENT}80` } : dirtyDotStyle}
          aria-label={t("block.unsavedDot")}
        />
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

      {readOnly ? (
        <span
          style={{ display: "inline-flex", color: TEXT_MUTED }}
          title={t("block.readOnlyTitle")}
          aria-label={t("block.readOnly")}
        >
          <Lock size={12} />
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
    </button>
  );
}
