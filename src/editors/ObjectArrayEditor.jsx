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
 * Palette comes from `variant`, like every other editor: this renders on the
 * dark drawer and on a light host page alike, and nothing here is drawer-only.
 *
 * Wording still comes from the `collections.*` catalog, which is where this grew
 * up; the keys move when the two catalogs are reorganised.
 */


import { moveItem, removeItem } from "../shared/util/list-ops.js";
import { useOpenRows } from "../core/hooks/use-open-rows.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "../shared/style/icons.jsx";
import { inertRef } from "../shared/ui/use-inert.js";
import { fieldVariant, noItemsStyle } from "./styles.js";
import { FIELD_HOVER, FIELD_LINE } from "./field-css.js";
import { FS_XS, FS_SM, FONT_MONO, R_SM } from "../shared/style/tokens.js";

/**
 * @param {{
 *   value: Record<string, *>[] | null | undefined,
 *   onChange: (next: Record<string, *>[]) => void,
 *   disabled?: boolean,
 *   addLabel: string,
 *   seedItem: () => Record<string, *>,
 *   summarize: (item: Record<string, *>) => string | null,
 *   renderItem: (item: Record<string, *>, onItemChange: (next: Record<string, *>) => void) => React.ReactNode,
 *   variant?: import("./styles.js").FieldVariantName,
 * }} props
 *   `addLabel` names one entry, already singular ("Çalışma"), for the add button.
 */
export function ObjectArrayEditor({ value, onChange, disabled, addLabel, seedItem, summarize, renderItem, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const items = Array.isArray(value) ? value : [];

  const { isOpen, toggle, open: openRow, afterRemove, afterMove } = useOpenRows();

  const updateItem = (/** @type {number} */ i, /** @type {Record<string, *>} */ nextItem) =>
    onChange(items.map((it, j) => (j === i ? nextItem : it)));

  const addNew = () => {
    onChange([...items, seedItem()]);
    openRow(items.length); // auto-expand the new tail item
  };

  const remove = (/** @type {number} */ i) => {
    onChange(removeItem(items, i));
    afterRemove(i);
  };

  const move = (/** @type {number} */ i, /** @type {-1|1} */ dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    onChange(next);
    afterMove(i, i + dir);
  };

  return (
    // The palette class rides the shell rather than each card: the cards style
    // themselves from the custom properties, which inherit. Without it they read
    // the drawer defaults whatever palette their own inputs are wearing.
    <div className={v.className || undefined} style={shellStyle}>
      {items.length === 0 ? (
        <div style={noItemsStyle}>{t("collections.noItems")}</div>
      ) : (
        <div style={listStyle}>
          {items.map((item, i) => {
            const rowOpen = isOpen(i);
            const summary = summarize(item);
            return (
              <div
                key={i}
                className="inscribed-repeat-item"
              >
                <button type="button" onClick={() => toggle(i)} aria-expanded={rowOpen} style={headerStyle}>
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
                  <span style={{ ...chevronStyle, transform: rowOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <ChevronDown size={14} />
                  </span>
                </button>
                {/* grid-rows 0fr/1fr animates height with no fixed measurement
                    or drawer-only CSS. The body stays mounted (clipped) when
                    closed, matching the drawer's keep-alive collapse. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: rowOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0.18, 1)",
                  }}
                >
                  <div ref={inertRef(!rowOpen)} style={bodyClipStyle} aria-hidden={!rowOpen}>
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
        <button type="button" onClick={addNew} className="inscribed-repeat-add">
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

// ---- Styles ---------------------------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const listStyle = { display: "flex", flexDirection: "column", gap: 6 };



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
  background: FIELD_HOVER,
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
  borderTop: `1px solid ${FIELD_LINE}`,
};

