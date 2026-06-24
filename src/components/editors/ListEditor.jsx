"use client";

/**
 * @file `ListEditor` - drawer-side editor for `List`-typed blocks.
 *
 * Mirrors the inline page UI (`<EditableList>`): per-item controls
 * (move up/down, delete) plus an "+ Add" button. Each item is rendered
 * as a sub-card whose body is the per-field editor stack
 * (Text/Image/Link/etc.) keyed by the registered itemSchema.
 *
 * `itemSchema` arrives via the AdminDrawer's CmsContext registry - it's
 * populated when an `<EditableList>` mounts on the page. Without it we
 * render a hint instead of editors so the admin sees why and the data
 * isn't lost.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, ChevronUp, ChevronDown } from "../icons.jsx";

import { addItem, moveItem, removeItem } from "../../lib/list-ops.js";
import { useCmsContext } from "../../lib/context.js";
import { ACCENT, TEXT_MUTED, STATUS_DANGER, R_BADGE, R_SM, emptyStateStyle } from "../admin-drawer-styles.js";

import { FieldEditor } from "./FieldEditor.jsx";

/**
 * @import { ItemSchema } from "../../lib/schemas.js"
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
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(value) ? value : [];

  if (!itemSchema) {
    return (
      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
        Bu liste için <code>itemSchema</code> bulunamadı. Sayfada{" "}
        <code>&lt;EditableList&gt;</code> render ediliyor mu?
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
          Liste boş. "+ Öğe ekle" butonuyla başlayabilirsin.
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
          onFieldChange={(k, v) => onFieldChange(i, k, v)}
          onRemove={() => onRemove(i)}
          onMoveUp={i > 0 ? () => onMove(i, -1) : null}
          onMoveDown={i < items.length - 1 ? () => onMove(i, 1) : null}
        />
      ))}

      {/* No "add item" affordance in read-only mode. */}
      {!disabled && (
        <button
          type="button"
          onClick={onAdd}
          style={listAddButtonStyle}
          className="inscribed-icon-action"
        >
          <Plus size={13} />
          <span>Öğe ekle</span>
        </button>
      )}
    </div>
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
 *   onFieldChange: (fieldKey: string, value: *) => void,
 *   onRemove: () => void,
 *   onMoveUp: (() => void) | null,
 *   onMoveDown: (() => void) | null,
 * }} props
 */
function ListItemCard({ blockPath, index, total, item, itemSchema, disabled, onFieldChange, onRemove, onMoveUp, onMoveDown }) {
  const { activeListItem, setActiveListItem } = useCmsContext();
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const summary = listItemSummary(itemSchema, item);

  // Page-side click on this list row sets `activeListItem`. When it points
  // at us, expand and scroll into view, then clear the signal so it fires
  // once (the user can collapse it again afterwards). Matches RegionItemCard.
  useEffect(() => {
    if (!activeListItem) return;
    if (activeListItem.path !== blockPath) return;
    if (activeListItem.index !== index) return;
    setIsOpen(true);
    setActiveListItem(null);
    // Wait a frame so the parent List card's collapse has begun laying out
    // before we scroll, otherwise the target's position is still stale.
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeListItem, blockPath, index, setActiveListItem]);

  return (
    <div
      ref={ref}
      style={{ ...listItemCardStyle, ...(hovered ? listItemCardHoverStyle : null) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{ ...listItemHeaderStyle, cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span style={listItemIndexStyle} title={`#${index + 1} / ${total}`}>{index + 1}</span>
        <span style={summary ? listItemSummaryStyle : listItemSummaryEmptyStyle}>
          {summary || "Boş öğe"}
        </span>

        {/* Reorder / delete controls are edit affordances — omitted in
            read-only mode, leaving the item header as a passive view. */}
        {!disabled && (
        <div style={{ display: "inline-flex", gap: 2, marginLeft: "auto" }}>
          {onMoveUp ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              style={listItemIconStyle}
              title="Yukarı taşı"
              aria-label="Yukarı taşı"
            >
              <ChevronUp size={12} />
            </button>
          ) : null}
          {onMoveDown ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              style={listItemIconStyle}
              title="Aşağı taşı"
              aria-label="Aşağı taşı"
            >
              <ChevronDown size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={listItemDangerStyle}
            title="Sil"
            aria-label="Sil"
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
                  // ListEditor already prints the field key as the label
                  // above each editor, so suppress the editor's own caption
                  // to avoid a redundant double label.
                  hideLabel: true,
                });
                return (
                  <div key={key} style={listFieldStyle}>
                    <div style={listFieldLabelStyle}>{key}</div>
                    {editor ?? (
                      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
                        <code>{field.blockType}</code> tipi list itemschema'sında desteklenmiyor.
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
  );
}

/**
 * One-line summary for a collapsed list item: the first Text/RichText
 * field that holds a non-empty string (RichText stripped of tags), so the
 * header reads like the item ("Ahmet Yılmaz") instead of a bare index.
 * Mirrors the Collection editor's `itemSummary`, keyed off `blockType`
 * rather than the collection field `type`. Returns null when there's
 * nothing usable, letting the caller fall back to a placeholder.
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

// Border split into longhand props so the hover style can override
// `borderColor` alone without React's shorthand/longhand-mix warning
// (which would otherwise leave the border stuck after the first un-hover).
// Tones stay in the gold/cream family — distinct from the Collection
// editor's neutral grays — so the two list surfaces read as different.
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

const listItemHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px 7px 9px",
  fontSize: 12,
  color: TEXT_MUTED,
});

// Gold index chip — same shape as the Collection editor's neutral badge
// but tinted to keep this surface visually distinct.
const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  flexShrink: 0,
  width: 20,
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

const listAddButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 12px",
  background: "transparent",
  border: `1px dashed color-mix(in srgb, ${ACCENT} 35%, transparent)`,
  borderRadius: R_SM,
  color: ACCENT,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
});