"use client";

/**
 * @file Repeatable accordion: a list of collapsible cards with per-row
 * move/delete and an add button under them.
 *
 * Schema-agnostic on purpose. It never reads a field descriptor; seeding,
 * summarising and rendering one row all arrive as callbacks. That keeps
 * `editors/` from depending on `collections/`, and it is what lets the caller
 * that renders the sub-form pass itself in without the two importing each other.
 *
 * Open state is a `Set` of indices remapped on every structural op, so the right
 * cards stay open through a reorder or a delete. Add/remove/reorder route
 * through `list-ops`, the same helpers `<EditableList>` uses.
 *
 * Neutral palette and no drawer-only CSS: this renders on the dark drawer and on
 * a light host page alike.
 *
 * Wording still comes from the `collections.*` catalog, which is where this grew
 * up; the keys move when the two catalogs are reorganised.
 */

import { useState } from "react";

import { moveItem, removeItem } from "../shared/util/list-ops.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "../shared/style/icons.jsx";
import { inertRef } from "../shared/ui/use-inert.js";
import { noItemsStyle } from "./styles.js";
import {
  neutralTint as neutral, FS_XS, FS_SM, FONT_MONO, R_SM, R_BTN, R_MD,
} from "../shared/style/tokens.js";

/**
 * @param {{
 *   value: Record<string, *>[] | null | undefined,
 *   onChange: (next: Record<string, *>[]) => void,
 *   disabled?: boolean,
 *   addLabel: string,
 *   seedItem: () => Record<string, *>,
 *   summarize: (item: Record<string, *>) => string | null,
 *   renderItem: (item: Record<string, *>, onItemChange: (next: Record<string, *>) => void) => React.ReactNode,
 * }} props
 *   `addLabel` names one entry, already singular ("Çalışma"), for the add button.
 */
export function RepeatEditor({ value, onChange, disabled, addLabel, seedItem, summarize, renderItem }) {
  const t = useCmsStrings();
  const items = Array.isArray(value) ? value : [];

  const [open, setOpen] = useState(/** @type {Set<number>} */ (() => new Set()));
  const [hovered, setHovered] = useState(/** @type {number | null} */ (null));

  const toggle = (/** @type {number} */ i) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const updateItem = (/** @type {number} */ i, /** @type {Record<string, *>} */ nextItem) =>
    onChange(items.map((it, j) => (j === i ? nextItem : it)));

  const addNew = () => {
    onChange([...items, seedItem()]);
    setOpen((prev) => new Set(prev).add(items.length)); // auto-expand the new tail item
  };

  const remove = (/** @type {number} */ i) => {
    onChange(removeItem(items, i));
    setOpen((prev) => shiftOpenAfterRemove(prev, i));
  };

  const move = (/** @type {number} */ i, /** @type {-1|1} */ dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    onChange(next);
    setOpen((prev) => swapOpen(prev, i, i + dir));
  };

  return (
    <div style={shellStyle}>
      {items.length === 0 ? (
        <div style={noItemsStyle}>{t("collections.noItems")}</div>
      ) : (
        <div style={listStyle}>
          {items.map((item, i) => {
            const isOpen = open.has(i);
            const summary = summarize(item);
            return (
              <div
                key={i}
                style={{ ...itemStyle, ...(hovered === i ? itemHoverStyle : null) }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              >
                <button type="button" onClick={() => toggle(i)} aria-expanded={isOpen} style={headerStyle}>
                  <span style={indexStyle}>{i + 1}</span>
                  <span style={summary ? summaryStyle : summaryEmptyStyle}>
                    {summary || t("collections.emptyItem")}
                  </span>
                  {!disabled && (
                    <span style={controlsStyle}>
                      <RowControl onClick={() => move(i, -1)} disabled={i === 0} label={t("collections.moveUp")}>
                        <ChevronUp size={14} />
                      </RowControl>
                      <RowControl onClick={() => move(i, 1)} disabled={i === items.length - 1} label={t("collections.moveDown")}>
                        <ChevronDown size={14} />
                      </RowControl>
                      <RowControl onClick={() => remove(i)} label={t("collections.deleteItemAt", { index: i + 1 })}>
                        <Trash2 size={13} />
                      </RowControl>
                    </span>
                  )}
                  <span style={{ ...chevronStyle, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <ChevronDown size={14} />
                  </span>
                </button>
                {/* grid-rows 0fr/1fr animates height with no fixed measurement
                    or drawer-only CSS. The body stays mounted (clipped) when
                    closed, matching the drawer's keep-alive collapse. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: isOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0.18, 1)",
                  }}
                >
                  <div ref={inertRef(!isOpen)} style={bodyClipStyle} aria-hidden={!isOpen}>
                    <div style={bodyStyle}>
                      {renderItem(item ?? {}, (next) => updateItem(i, next))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!disabled && (
        <button type="button" onClick={addNew} style={addBtnStyle}>
          <Plus size={14} />
          {t("collections.addNamed", { name: addLabel })}
        </button>
      )}
    </div>
  );
}

/**
 * Icon affordance for an accordion row header. A `role="button"` span, not a
 * `<button>`, because it lives inside the header button (nested buttons are
 * invalid); stops click/key propagation so it doesn't also toggle the row.
 *
 * @param {{
 *   onClick: () => void,
 *   disabled?: boolean,
 *   label: string,
 *   children: React.ReactNode,
 * }} props
 */
function RowControl({ onClick, disabled, label, children }) {
  const act = (/** @type {*} */ e) => {
    e.stopPropagation();
    if (!disabled) onClick();
  };
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={label}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(e); }
      }}
      style={{ ...rowControlStyle, ...(disabled ? rowControlDisabledStyle : null) }}
    >
      {children}
    </span>
  );
}

/**
 * Remap an open-index set after element `removed` is dropped: forget that
 * index and slide every higher index down by one so the surviving cards
 * keep their open/closed state.
 *
 * @param {Set<number>} set
 * @param {number} removed
 * @returns {Set<number>}
 */
function shiftOpenAfterRemove(set, removed) {
  /** @type {Set<number>} */
  const next = new Set();
  for (const idx of set) {
    if (idx === removed) continue;
    next.add(idx > removed ? idx - 1 : idx);
  }
  return next;
}

/**
 * Swap the open/closed membership of two indices after a reorder, so a
 * moved card carries its expanded state to its new position.
 *
 * @param {Set<number>} set
 * @param {number} a
 * @param {number} b
 * @returns {Set<number>}
 */
function swapOpen(set, a, b) {
  const hasA = set.has(a);
  const hasB = set.has(b);
  const next = new Set(set);
  next.delete(a);
  next.delete(b);
  if (hasB) next.add(a);
  if (hasA) next.add(b);
  return next;
}

// ---- Styles ---------------------------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const listStyle = { display: "flex", flexDirection: "column", gap: 6 };

const itemStyle = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: neutral(32),
  borderRadius: R_MD,
  background: neutral(3),
  overflow: "hidden",
  transition: "background-color 140ms ease, border-color 140ms ease",
};
const itemHoverStyle = {
  background: neutral(6),
  borderColor: neutral(50),
};
const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "7px 8px 7px 10px",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};
const indexStyle = {
  flexShrink: 0,
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  fontSize: FS_XS,
  fontWeight: 600,
  fontFamily: FONT_MONO,
  background: neutral(12),
  opacity: 0.85,
};
const summaryStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: FS_SM,
  fontWeight: 450,
  marginTop: -1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const summaryEmptyStyle = {
  ...summaryStyle,
  opacity: 0.4,
  fontWeight: 400,
  fontStyle: "italic",
};
const controlsStyle = { display: "inline-flex", alignItems: "center", gap: 1, flexShrink: 0 };
const rowControlStyle = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: R_SM,
  color: "inherit",
  opacity: 0.55,
  cursor: "pointer",
  transition: "opacity 140ms ease",
};
const rowControlDisabledStyle = { opacity: 0.2, cursor: "not-allowed" };
const chevronStyle = {
  flexShrink: 0,
  display: "inline-flex",
  opacity: 0.5,
  marginLeft: 2,
  transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1)",
};

const bodyClipStyle = { overflow: "hidden", minHeight: 0 };
const bodyStyle = {
  padding: "10px 12px 12px",
  borderTop: `1px solid ${neutral(18)}`,
};
const addBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  width: "100%",
  padding: "9px 12px",
  border: `1px dashed ${neutral(40)}`,
  borderRadius: R_BTN,
  background: "transparent",
  color: "inherit",
  fontSize: FS_SM,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};
