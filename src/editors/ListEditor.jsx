"use client";

/**
 * @file `ListEditor`: drawer-side editor for `List`-typed blocks, mirroring
 * `<EditableList>` (per-item move/delete + "+ Add"). Each item is a sub-card
 * whose body is the per-field editor stack keyed by the registered itemSchema.
 *
 * `itemSchema` comes from the CmsContext registry, populated when an
 * `<EditableList>` mounts. Without it we render a hint instead of editors.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Plus, Trash2, ChevronDown } from "../shared/style/icons.jsx";

import { addItem, moveItemTo, moveItemToIndex, removeItem } from "../shared/util/list-ops.js";
import { firstNonEmptyText } from "../shared/util/text.js";
import { useOpenRows } from "../core/hooks/use-open-rows.js";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import {
  useListReorder, LANDING_TRANSFORM, SHIFT_TRANSFORM, SETTLE_MS, SHIFT_MS,
} from "../core/hooks/use-list-reorder.js";
import { useStoreSelector } from "../shared/state/store.js";
import { PositionField } from "../shared/ui/PositionField.jsx";
import { FieldMessage } from "./FieldMessage.jsx";
import { noItemsStyle } from "./styles.js";
import {
  ACCENT, BG_RAISED, BORDER, EASE, TEXT_MUTED, TEXT_FAINT,
  FONT_SANS, R_BADGE, R_SM, dynamicSize,
} from "../shared/style/tokens.js";

import { FieldEditor } from "./FieldEditor.jsx";

/**
 * @import { ItemSchema } from "../shared/contracts/schemas.js"
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

  // Which cards are expanded, held here rather than by each card: React reuses
  // rows by key, so a card that owned the flag would keep it while the item
  // underneath moved away on a reorder.
  const { isOpen, toggle, open: openRow, afterRemove, afterMove } = useOpenRows();

  // Same engine as the page-side list, so the two cannot drift apart on what a
  // drop means.
  const { drag, flip, suppress, registerNode, beginDrag, animateMove } = useListReorder({
    onReorder: (from, to) => {
      const next = moveItemTo(items, from, to);
      if (next === items) return;
      onChange(next);
      // `to` names the gap; the item lands one earlier when it was pulled out
      // from above, exactly as `moveItemTo` computes it.
      afterMove(from, to > from ? to - 1 : to);
    },
  });

  if (!itemSchema) {
    return (
      <FieldMessage tone="warn">
        {t("editors.list.noSchema", { schema: "itemSchema", component: "<EditableList>" })}
      </FieldMessage>
    );
  }

  /** @param {Record<string, *>[]} next */
  const setItems = (next) => onChange(next);

  const onAdd = () => setItems(addItem(items, itemSchema));

  /** @param {number} i */
  const onRemove = (i) => {
    setItems(removeItem(items, i));
    afterRemove(i);
  };

  /** @param {number} i @param {number} seat */
  const onMoveTo = (i, seat) => {
    const target = Math.max(0, Math.min(seat, items.length - 1));
    const next = moveItemToIndex(items, i, target);
    if (next === items) return;
    animateMove(i, target);
    setItems(next);
    afterMove(i, target);
  };

  /** @param {number} i @param {string} fieldKey @param {*} fieldValue */
  const onFieldChange = (i, fieldKey, fieldValue) => {
    const next = items.slice();
    next[i] = { ...next[i], [fieldKey]: fieldValue };
    setItems(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.length === 0 ? (
        <div style={noItemsStyle}>
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
          isOpen={isOpen(i)}
          onToggle={() => toggle(i)}
          onOpen={() => openRow(i)}
          onFieldChange={(k, v) => onFieldChange(i, k, v)}
          onRemove={() => onRemove(i)}
          onMoveTo={(seat) => onMoveTo(i, seat)}
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
 * The margin is its own: the rows sit 4px apart now that they are lines rather
 * than cards, and the add row is a different kind of thing from a row.
 *
 * @param {{ onAdd: () => void, label: string }} props
 */
function AddItemButton({ onAdd, label }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inscribed-repeat-add"
      style={addButtonStyle}
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
 *   isOpen: boolean,
 *   onToggle: () => void,
 *   onOpen: () => void,
 *   onFieldChange: (fieldKey: string, value: *) => void,
 *   onRemove: () => void,
 *   onMoveTo: (seat: number) => void,
 * }} props
 */
function ListItemCard({
  blockPath, index, total, item, itemSchema, disabled,
  registerNode, onGrab, dragging, settling, shifting, flipOffset, suppressSlide,
  isOpen, onToggle, onOpen,
  onFieldChange, onRemove, onMoveTo,
}) {
  // Selects a boolean, not the signal itself: a row click elsewhere in the list
  // leaves the other cards alone.
  const { uiStore, setActiveListItem } = useCmsContext();
  const t = useCmsStrings();
  const isTarget = useStoreSelector(
    uiStore,
    (s) => s.activeListItem?.path === blockPath && s.activeListItem?.index === index,
  );
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
    onOpen();
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
        className="inscribed-repeat-row"
        style={dragging ? listItemCardLiftStyle : undefined}
      >
      <div
        className="inscribed-repeat-row-header"
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
          onToggle();
        }}
      >
        {/* Handle and seat are two things, so they get two slots. The grip's
            width is reserved whether or not it is showing, so hovering a row
            never shifts the summary beside it; the badge stays what it has
            always been, a field you click and type a position into. */}
        <span aria-hidden="true" style={listItemGripStyle} className="inscribed-repeat-grip">
          {disabled ? null : <GripVertical size={13} />}
        </span>
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

        {/* The block row's fixed lane, to the pixel: delete (an edit
            affordance, so it is absent in read-only mode) and the chevron.
            Reserving it rather than sizing to content is what keeps a summary
            from re-wrapping the moment the pointer arrives. */}
        <span style={listItemActionsStyle}>
          {disabled ? null : (
            <button
              type="button"
              data-no-drag
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="inscribed-repeat-delete"
              style={listItemDangerStyle}
              title={t("editors.list.delete")}
              aria-label={t("editors.list.delete")}
            >
              <Trash2 size={12} />
            </button>
          )}
          <motion.span
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.24, ease: EASE_POINTS }}
            style={{ display: "inline-flex", color: TEXT_MUTED }}
          >
            <ChevronDown size={13} />
          </motion.span>
        </span>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            variants={bodyVariants}
            initial="closed"
            animate="open"
            exit="closed"
            style={{ overflow: "hidden" }}
          >
            <motion.div variants={fieldGroupVariants} style={listItemBodyStyle}>
              {Object.entries(itemSchema).map(([key, field]) => {
                const editor = FieldEditor({
                  blockType: field.blockType,
                  value: item[key],
                  onChange: (v) => onFieldChange(key, v),
                  disabled,
                  // Straight off the row schema rather than the registry a page
                  // block uses: a column's vocabulary is declared with the column.
                  source: field.source ?? null,
                  // The field key is already printed above, so drop the editor's
                  // own caption to avoid a double label.
                  hideLabel: true,
                });
                return (
                  <motion.div key={key} variants={fieldVariants} style={listFieldStyle}>
                    <div style={listFieldLabelStyle}>{key}</div>
                    {editor ?? (
                      <FieldMessage tone="warn">
                        {t("editors.list.unsupportedField", { type: field.blockType })}
                      </FieldMessage>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </div>
  );
}

// ---- Open/close motion ----------------------------------------------------

// Framer wants the curve as points; the token is the CSS spelling of the same
// one, and everything in the drawer opens on it.
const EASE_POINTS = [0.32, 0.72, 0.18, 1];

// Opening makes room first and lets the fields arrive into it, which is why the
// box and its contents are two animations rather than one fade over both.
// Closing is quicker and unstaggered: a row folding shut is not something
// anyone needs to watch, and the clip hides most of it anyway.
const bodyVariants = {
  closed: { height: 0, transition: { duration: 0.18, ease: EASE_POINTS } },
  open: { height: "auto", transition: { duration: 0.26, ease: EASE_POINTS } },
};

const fieldGroupVariants = {
  closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
  open: { transition: { delayChildren: 0.07, staggerChildren: 0.045 } },
};

// Drifting up into the gap the box just opened, rather than fading in place.
const fieldVariants = {
  closed: { opacity: 0, y: 6, transition: { duration: 0.1 } },
  open: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
};

// Only the text types name a row here. A list item's Date holds a string too,
// but an ISO timestamp in the header reads like a bug, and unlike a collection
// field a list item always has a text field to fall back on.
const TEXTY = new Set(["ShortText", "LongText", "RichText"]);

/**
 * One-line summary for a collapsed list item, so the header reads like the item
 * instead of a bare index. Returns null when nothing usable.
 *
 * @param {ItemSchema} itemSchema
 * @param {Record<string, *> | undefined} item
 * @returns {string | null}
 */
function listItemSummary(itemSchema, item) {
  if (!item) return null;
  return firstNonEmptyText(
    Object.entries(itemSchema)
      .filter(([, field]) => TEXTY.has(field.blockType))
      .map(([key, field]) => ({ value: item[key], type: field.blockType })),
  );
}

// ---- Styles ---------------------------------------------------------------

// Border in longhand props so hover can override `borderColor` alone without
// React's shorthand/longhand-mix warning (which would stick the border after
// un-hover). Gold/cream tones keep it distinct from the Collection editor.




const addButtonStyle = /** @type {React.CSSProperties} */ ({ marginTop: 4 });

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
  gap: 6,
  padding: "5px 6px 5px 0",
  fontSize: dynamicSize(12),
  color: TEXT_MUTED,
});

// Reserved, not conditional: the grip fades in on hover (see
// `.inscribed-repeat-grip`) and a slot that appeared with it would push the
// whole row sideways under the pointer.
const listItemGripStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  // Narrower than the glyph's own box, which is fine: the six dots only ink the
  // middle third of it. Every pixel in this slot is one the summary does not
  // get, and the summary is the only part of the row carrying content.
  width: 10,
  // Pulls the badge back toward the grip: the row's 6px gap is right between
  // the badge and the summary, but too wide between a handle and the number it
  // belongs to.
  marginRight: -3,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: TEXT_MUTED,
});

// The block row's `rowActionsStyle`, restated here rather than imported: the
// editor kit does not reach up into `admin/`. Keep the two in step.
const listItemActionsStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 2,
  flexShrink: 0,
  marginLeft: "auto",
  width: 46,
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

// The seat readout. Neutral, not tinted: the accent is spent on state and on
// create actions, and an index is neither, so a list of ten of these used to
// put ten accent chips in a panel that was otherwise saving the colour for
// unsaved work. `boxSizing` is explicit because the width above includes the
// padding and nothing in the drawer resets it.
const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  boxSizing: "border-box",
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  fontFamily: FONT_SANS,
  // The box is sized in `ch` (see `indexBoxWidth`), which only holds still if
  // every digit is the same width. Mono gave that for free; the sans has to be
  // told.
  fontVariantNumeric: "tabular-nums",
  fontSize: dynamicSize(11),
  fontWeight: 600,
  color: TEXT_MUTED,
  background: `color-mix(in srgb, var(--ins-text, #fff) 6%, transparent)`,
});

// The badge's own box, so typing a position never resizes the row. Only the
// fill changes, which is the whole signal that the readout has become a field.
const listItemIndexInputStyle = /** @type {React.CSSProperties} */ ({
  ...listItemIndexStyle,
  padding: 0,
  border: 0,
  color: ACCENT,
  background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
  textAlign: "center",
  outline: "none",
});

const listItemSummaryStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  fontSize: dynamicSize(12),
  fontWeight: 450,
  marginTop: -1,
  color: "color-mix(in srgb, var(--ins-text, #fff) 90%, transparent)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const listItemSummaryEmptyStyle = /** @type {React.CSSProperties} */ ({
  ...listItemSummaryStyle,
  color: TEXT_FAINT,
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

// Muted at rest, danger on hover (see `.inscribed-repeat-delete`). A row that
// paints its delete red before anyone has reached for it reads as a warning
// about the row itself.
const listItemDangerStyle = /** @type {React.CSSProperties} */ ({
  ...listItemIconStyle,
  borderRadius: R_SM,
});

// Hung off a guide under the badge column rather than closed in by a rule above
// it. The badge starts at 13px (no inset, a 10px grip slot, then 3px) with a
// 20px box, so the line lands at 23.5px and reads as running down out of the
// number, the same way a block row's body drops out of its type glyph. Tone
// matches that guide too: it says "open", never "changed".
const listItemBodyStyle = /** @type {React.CSSProperties} */ ({
  margin: "2px 0 6px 22px",
  padding: "2px 0 4px 14px",
  borderLeft: `1px solid ${BORDER}`,
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const listFieldStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

// A row schema's field key, and it is a key, so it is mono like every other
// label in the panel. It used to be the one sans caption left inside the Page
// tab, which put three label languages in one column.
const listFieldLabelStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_SANS,
  fontSize: dynamicSize(10.5),
  fontWeight: 500,
  color: TEXT_MUTED,
});

// Border in longhand so hover can override `borderColor` alone, as on the cards.


