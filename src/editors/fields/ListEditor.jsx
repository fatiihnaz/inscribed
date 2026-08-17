"use client";

/**
 * @file `ListEditor`: drawer-side editor for `List`-typed blocks, mirroring
 * `<EditableList>` (per-item move/delete + "+ Add"). Each item is a sub-card
 * whose body is the per-field editor stack keyed by the registered itemSchema.
 *
 * `itemSchema` comes from the CmsContext registry, populated when an
 * `<EditableList>` mounts. Without it we render a hint instead of editors.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, ChevronUp, ChevronDown } from "../../shared/style/icons.jsx";

import { addItem, moveItem, moveItemTo, moveItemToIndex, removeItem } from "../../shared/util/list-ops.js";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import {
  useListReorder, LANDING_TRANSFORM, SHIFT_TRANSFORM, SETTLE_MS, SHIFT_MS,
} from "../../core/hooks/use-list-reorder.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { PositionField } from "../../shared/ui/PositionField.jsx";
import { emptyStateStyle } from "./styles.js";
import {
  ACCENT, BG_RAISED, DUR_FAST, EASE, TEXT_MUTED, STATUS_DANGER, R_BADGE, R_SM,
} from "../../shared/style/tokens.js";

import { FieldEditor } from "./FieldEditor.jsx";

/**
 * @import { ItemSchema } from "../../shared/contracts/schemas.js"
 */

/**
 * @param {{
 *   blockPath?: string,
 *   value: *,
 *   onChange: (value: *) => void,
 *   itemSchema: ItemSchema | null,
 *   disabled?: boolean,
 * }} props
 */
export function ListEditor({ blockPath, value, onChange, itemSchema, disabled }) {
  const t = useCmsStrings();
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(value) ? value : [];

  // Same engine as the page-side list, so the two cannot drift apart on what a
  // drop means.
  const { drag, flip, suppress, registerNode, beginDrag, animateMove } = useListReorder({
    onReorder: (from, to) => {
      const next = moveItemTo(items, from, to);
      if (next !== items) onChange(next);
    },
  });

  if (!itemSchema) {
    return (
      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
        {t("editors.list.noSchema", { schema: "itemSchema", component: "<EditableList>" })}
      </div>
    );
  }

  /** @param {Record<string, *>[]} next */
  const setItems = (next) => onChange(next);

  const onAdd = () => setItems(addItem(items, itemSchema));

  /** @param {number} i */
  const onRemove = (i) => setItems(removeItem(items, i));

  /** @param {number} i @param {-1|1} dir */
  const onMove = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    // Before the commit: the boxes have to be measured as they still are.
    animateMove(i, i + dir);
    setItems(next);
  };

  /** @param {number} i @param {number} seat */
  const onMoveTo = (i, seat) => {
    const target = Math.max(0, Math.min(seat, items.length - 1));
    const next = moveItemToIndex(items, i, target);
    if (next === items) return;
    animateMove(i, target);
    setItems(next);
  };

  /** @param {number} i @param {string} fieldKey @param {*} fieldValue */
  const onFieldChange = (i, fieldKey, fieldValue) => {
    const next = items.slice();
    next[i] = { ...next[i], [fieldKey]: fieldValue };
    setItems(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 ? (
        <div style={emptyStateStyle}>
          {t("editors.list.empty")}
        </div>
      ) : null}

      {items.map((item, i) => (
        <ListItemCard
          key={i}
          blockPath={blockPath}
          index={i}
          total={items.length}
          item={item}
          itemSchema={itemSchema}
          disabled={disabled}
          registerNode={registerNode}
          onGrab={beginDrag}
          dragging={drag?.from === i}
          settling={drag?.settling ?? false}
          shifting={drag != null}
          flipOffset={flip?.get(i) ?? null}
          suppressSlide={suppress}
          onFieldChange={(k, v) => onFieldChange(i, k, v)}
          onRemove={() => onRemove(i)}
          onMoveTo={(seat) => onMoveTo(i, seat)}
          onMoveUp={i > 0 ? () => onMove(i, -1) : null}
          onMoveDown={i < items.length - 1 ? () => onMove(i, 1) : null}
        />
      ))}

      {/* No "add item" affordance in read-only mode. */}
      {!disabled && <AddItemButton onAdd={onAdd} label={t("editors.list.addItem")} />}
    </div>
  );
}

/**
 * Lights up like the page-side add slot: the dashed edge is the affordance, so
 * hover strengthens it rather than swapping in a different surface.
 *
 * @param {{ onAdd: () => void, label: string }} props
 */
function AddItemButton({ onAdd, label }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onAdd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{ ...listAddButtonStyle, ...(hovered ? listAddButtonHoverStyle : null) }}
    >
      <Plus size={13} />
      <span>{label}</span>
    </button>
  );
}

/**
 * @param {{
 *   blockPath?: string,
 *   index: number,
 *   total: number,
 *   item: Record<string, *>,
 *   itemSchema: ItemSchema,
 *   disabled?: boolean,
 *   registerNode: (index: number, el: HTMLElement | null) => void,
 *   onGrab: (index: number, event: React.PointerEvent, options?: { threshold?: number }) => void,
 *   dragging: boolean,
 *   settling: boolean,
 *   shifting: boolean,
 *   flipOffset: { dx: number, dy: number } | null,
 *   suppressSlide: boolean,
 *   onFieldChange: (fieldKey: string, value: *) => void,
 *   onRemove: () => void,
 *   onMoveTo: (seat: number) => void,
 *   onMoveUp: (() => void) | null,
 *   onMoveDown: (() => void) | null,
 * }} props
 */
function ListItemCard({
  blockPath, index, total, item, itemSchema, disabled,
  registerNode, onGrab, dragging, settling, shifting, flipOffset, suppressSlide,
  onFieldChange, onRemove, onMoveTo, onMoveUp, onMoveDown,
}) {
  // Selects a boolean, not the signal itself: a row click elsewhere in the list
  // leaves the other cards alone.
  const { uiStore, setActiveListItem } = useCmsContext();
  const t = useCmsStrings();
  const isTarget = useStoreSelector(
    uiStore,
    (s) => s.activeListItem?.path === blockPath && s.activeListItem?.index === index,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  // A press that turned into a drag still fires a click on release, which would
  // toggle the card open every time it is dropped. Latched while the drag runs,
  // since by click time it is already over.
  const draggedRef = useRef(false);
  const summary = listItemSummary(itemSchema, item);

  // When `activeListItem` points at us (page-side row click), expand, scroll
  // into view, and clear the signal so it fires once. Matches RegionItemCard.
  useEffect(() => {
    if (!isTarget) return;
    setIsOpen(true);
    setActiveListItem(null);
    // Wait a frame so the parent collapse has begun laying out before we
    // scroll, else the target's position is stale.
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [isTarget, setActiveListItem]);

  useEffect(() => {
    if (dragging) draggedRef.current = true;
  }, [dragging]);

  const tracking = dragging && !settling;
  const slide = suppressSlide || tracking
    ? "none"
    : `transform ${dragging ? SETTLE_MS : SHIFT_MS}ms ${EASE}`;

  return (
    // Outer box carries the drag: the card below clips its own content, which
    // would eat the landing marker.
    <div
      ref={(el) => {
        ref.current = el;
        registerNode(index, el);
      }}
      style={{
        position: "relative",
        transform: shifting
          ? SHIFT_TRANSFORM
          : flipOffset
            ? `translate3d(${flipOffset.dx}px, ${flipOffset.dy}px, 0)`
            : undefined,
        zIndex: dragging ? 5 : undefined,
        transition: slide === "none" ? undefined : slide,
      }}
    >
      {dragging ? (
        <span
          aria-hidden="true"
          style={{
            ...landingSlotStyle,
            transform: LANDING_TRANSFORM,
            opacity: settling ? 0 : 1,
            transition: `opacity ${SETTLE_MS}ms ${EASE}`,
          }}
        />
      ) : null}
      <div
        style={{
          ...listItemCardStyle,
          ...(hovered && !dragging ? listItemCardHoverStyle : null),
          ...(dragging ? listItemCardLiftStyle : null),
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
      <div
        style={{
          ...listItemHeaderStyle,
          cursor: disabled ? "pointer" : dragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: disabled ? undefined : "none",
        }}
        // The header is the handle. A threshold keeps the plain click working:
        // move past it and it is a drag, release inside it and it toggles.
        onPointerDown={disabled ? undefined : (e) => {
          if (/** @type {HTMLElement} */ (e.target).closest("[data-no-drag]")) return;
          draggedRef.current = false;
          onGrab(index, e, { threshold: 4 });
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          setIsOpen((v) => !v);
        }}
      >
        <span data-no-drag>
          <PositionField
            index={index}
            total={total}
            onMoveTo={onMoveTo}
            label={t("core.item.position", { index: index + 1, total })}
            editLabel={t("core.item.moveTo")}
            style={{ ...listItemIndexStyle, width: indexBoxWidth(total) }}
            inputStyle={{ ...listItemIndexInputStyle, width: indexBoxWidth(total) }}
            disabled={disabled}
          >
            {index + 1}
          </PositionField>
        </span>
        <span style={summary ? listItemSummaryStyle : listItemSummaryEmptyStyle}>
          {summary || t("editors.list.emptyItem")}
        </span>

        {/* Reorder/delete are edit affordances, omitted in read-only mode. */}
        {!disabled && (
        <div data-no-drag style={{ display: "inline-flex", gap: 2, marginLeft: "auto" }}>
          {onMoveUp ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              style={listItemIconStyle}
              title={t("editors.list.moveUp")}
              aria-label={t("editors.list.moveUp")}
            >
              <ChevronUp size={12} />
            </button>
          ) : null}
          {onMoveDown ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              style={listItemIconStyle}
              title={t("editors.list.moveDown")}
              aria-label={t("editors.list.moveDown")}
            >
              <ChevronDown size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={listItemDangerStyle}
            title={t("editors.list.delete")}
            aria-label={t("editors.list.delete")}
          >
            <Trash2 size={12} />
          </button>
        </div>
        )}

        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED, marginLeft: disabled ? "auto" : 4 }}
        >
          <ChevronDown size={13} />
        </motion.span>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={listItemBodyStyle}>
              {Object.entries(itemSchema).map(([key, field]) => {
                const editor = FieldEditor({
                  blockType: field.blockType,
                  value: item[key],
                  onChange: (v) => onFieldChange(key, v),
                  disabled,
                  // The field key is already printed above, so drop the editor's
                  // own caption to avoid a double label.
                  hideLabel: true,
                });
                return (
                  <div key={key} style={listFieldStyle}>
                    <div style={listFieldLabelStyle}>{key}</div>
                    {editor ?? (
                      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
                        {t("editors.list.unsupportedField", { type: field.blockType })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * One-line summary for a collapsed list item: the first Text/RichText field
 * holding a non-empty string (RichText stripped of tags), so the header reads
 * like the item instead of a bare index. Returns null when nothing usable.
 *
 * @param {ItemSchema} itemSchema
 * @param {Record<string, *> | undefined} item
 * @returns {string | null}
 */
function listItemSummary(itemSchema, item) {
  if (!item) return null;
  const TEXTY = new Set(["Text", "ShortText", "LongText", "RichText"]);
  for (const [key, field] of Object.entries(itemSchema)) {
    if (!TEXTY.has(field.blockType)) continue;
    const raw = item[key];
    if (typeof raw !== "string") continue;
    const text = (field.blockType === "RichText" ? raw.replace(/<[^>]*>/g, " ") : raw).trim();
    if (text) return text;
  }
  return null;
}

// ---- Styles ---------------------------------------------------------------

// Border in longhand props so hover can override `borderColor` alone without
// React's shorthand/longhand-mix warning (which would stick the border after
// un-hover). Gold/cream tones keep it distinct from the Collection editor.
const listItemCardStyle = /** @type {React.CSSProperties} */ ({
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
  borderRadius: R_SM,
  background: `color-mix(in srgb, ${ACCENT} 3%, transparent)`,
  overflow: "hidden",
  transition: "background-color 140ms ease, border-color 140ms ease",
});

const listItemCardHoverStyle = /** @type {React.CSSProperties} */ ({
  borderColor: `color-mix(in srgb, ${ACCENT} 34%, transparent)`,
  background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
});

// Held card: opaque, so it reads as lifted over the ones it passes rather than
// blended into them.
const listItemCardLiftStyle = /** @type {React.CSSProperties} */ ({
  borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
  background: BG_RAISED,
  boxShadow: "0 10px 24px -8px rgba(0, 0, 0, 0.5)",
});

// Where the held card will land. Same dashed-accent language as the page side.
const landingSlotStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  boxSizing: "border-box",
  border: `1.5px dashed color-mix(in srgb, ${ACCENT} 55%, transparent)`,
  borderRadius: R_SM,
  background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
  pointerEvents: "none",
});

const listItemHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px 7px 9px",
  fontSize: 12,
  color: TEXT_MUTED,
});

/**
 * The box the badge and the position input share. Sized from the list's length
 * rather than the item's own number, so nothing resizes when item 9 becomes
 * item 10 either. The face is mono, so a digit is exactly 1ch; the floor keeps
 * a single-digit badge the 20px square it was drawn as.
 *
 * @param {number} total
 */
function indexBoxWidth(total) {
  const digits = String(Math.max(total, 1)).length;
  return `max(20px, calc(${digits}ch + 10px))`;
}

// Gold index chip, tinted to keep this surface distinct from the Collection
// editor. `boxSizing` is explicit because the width above includes the padding
// and nothing in the drawer resets it.
const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  boxSizing: "border-box",
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontSize: 11,
  fontWeight: 600,
  color: ACCENT,
  background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
});

// The badge's own box, so typing a position never resizes the row. Only the
// fill changes, which is the whole signal that the readout has become a field.
const listItemIndexInputStyle = /** @type {React.CSSProperties} */ ({
  ...listItemIndexStyle,
  padding: 0,
  border: 0,
  background: `color-mix(in srgb, ${ACCENT} 26%, transparent)`,
  textAlign: "center",
  outline: "none",
});

const listItemSummaryStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  fontWeight: 450,
  marginTop: -1,
  color: "color-mix(in srgb, var(--ins-text, #fff) 90%, transparent)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const listItemSummaryEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...listItemSummaryStyle,
  color: TEXT_MUTED,
  fontWeight: 400,
  fontStyle: "italic",
});

const listItemIconStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: TEXT_MUTED,
  borderRadius: R_BADGE,
  cursor: "pointer",
  padding: 0,
});

const listItemDangerStyle = /** @type {React.CSSProperties} */ ({
  ...listItemIconStyle,
  color: STATUS_DANGER,
});

const listItemBodyStyle = /** @type {React.CSSProperties} */ ({
  padding: "8px 10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderTop: `1px solid color-mix(in srgb, ${ACCENT} 8%, transparent)`,
});

const listFieldStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const listFieldLabelStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 10,
  fontWeight: 600,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});

// Border in longhand so hover can override `borderColor` alone, as on the cards.
const listAddButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 12px",
  background: `color-mix(in srgb, ${ACCENT} 4%, transparent)`,
  borderWidth: 1,
  borderStyle: "dashed",
  borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)`,
  borderRadius: R_SM,
  color: `color-mix(in srgb, ${ACCENT} 75%, transparent)`,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, color ${DUR_FAST} ${EASE}`,
});

const listAddButtonHoverStyle = /** @type {React.CSSProperties} */ ({
  background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
  borderColor: `color-mix(in srgb, ${ACCENT} 70%, transparent)`,
  color: ACCENT,
});