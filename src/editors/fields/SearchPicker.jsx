"use client";

/**
 * @file The panel body behind every "pick one of these" control: a search row,
 * a paged list, and a footer carrying the pager and the clear action.
 *
 * Paged rather than scrolled. A scrolling list inside a floating panel gives the
 * pointer two scroll surfaces to fight over and hides how much is left, where a
 * fixed page keeps the panel one height and says "2 / 5" out loud. It also keeps
 * keyboard walking bounded, since arrows only ever cross what is on screen.
 *
 * Owns pagination but not the cursor: `active` is an index into the whole list
 * and lives with the caller, because Enter has to commit against the same array
 * the caller filtered. Which page shows is derived from it, so walking off the
 * end of one turns to the next instead of the two drifting apart.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Check, ChevronLeft, ChevronRight, Plus, Search } from "../../shared/style/icons.jsx";
import { slideVariants, staggerItem } from "../../shared/ui/panel-motion.js";
import { useInteractive } from "../../shared/ui/use-interactive.js";
import { ACCENT, DUR_FAST, EASE, FS_MICRO, FS_SM, FS_XS, R_SM } from "../../shared/style/tokens.js";

export const PER_PAGE = 6;

// One row's height, so a short last page does not shrink the box the pages
// slide through. Without it the list resizes mid-transition and the footer
// walks up the panel.
const ROW_HEIGHT = 31;
const PAGE_SPRING = { type: "spring", stiffness: 420, damping: 38 };

/**
 * @typedef {Object} PickerRow
 * @property {string} value
 * @property {string} label          Raw text; what a create row hands back.
 * @property {string} [display]      Rendered instead of `label` where the two differ.
 * @property {string} [hint]
 * @property {boolean} [create]
 * @property {boolean} [selected]
 */

/**
 * @param {{
 *   rows: PickerRow[],
 *   active: number,
 *   onActiveChange: (index: number) => void,
 *   onCommit: (row: PickerRow) => void,
 *   note?: string | null,
 *   loading?: boolean,
 *   searchValue: string,
 *   onSearchChange: (value: string) => void,
 *   onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void,
 *   onSearchPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void,
 *   searchPlaceholder: string,
 *   inputRef?: { current: HTMLInputElement | null },
 *   clearLabel?: string,
 *   onClear?: (() => void) | null,
 *   clearActive?: boolean,
 *   prevPageLabel: string,
 *   nextPageLabel: string,
 *   palette: *,
 * }} props
 *   `onClear` is the capability and `clearActive` is whether there is anything
 *   to clear right now. They are separate so the footer can hold its place when
 *   the value goes away, instead of the panel shrinking a row on clear.
 */
export function SearchPicker({
  rows, active, onActiveChange, onCommit, note, loading,
  searchValue, onSearchChange, onSearchKeyDown, onSearchPaste, searchPlaceholder, inputRef,
  clearLabel, onClear, clearActive, prevPageLabel, nextPageLabel, palette: v,
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(Math.floor(active / PER_PAGE) + 1, totalPages);
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Slide only when the visible records actually change: typing that narrows
  // nothing should leave the list alone. Built straight from the rows rather
  // than memoised on them, since slicing hands back a new array every render
  // and a memo keyed on it would never hit.
  const listKey = `${page}:${pageRows.map((r) => (r.create ? `+${r.label}` : r.value)).join(" ")}`;

  // Which way the page slides. The pager sets it before the page moves, so a
  // click animates the way it was clicked; the effect only covers page turns
  // that came from somewhere else (arrowing off the end of a page).
  const [direction, setDirection] = useState(1);
  const lastPage = useRef(page);
  useEffect(() => {
    if (page !== lastPage.current) {
      setDirection(page > lastPage.current ? 1 : -1);
      lastPage.current = page;
    }
  }, [page]);

  const turnTo = (/** @type {number} */ nextPage) => {
    setDirection(nextPage > page ? 1 : -1);
    lastPage.current = nextPage;
    onActiveChange((nextPage - 1) * PER_PAGE);
  };

  const pageable = totalPages > 1 && !note;
  const showFooter = Boolean(onClear) || pageable;

  return (
    <>
      <motion.div variants={staggerItem} style={{ ...searchRowStyle, background: v.hoverBg, borderColor: v.border }}>
        <Search size={13} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.4 }} />
        <input
          ref={inputRef}
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onPaste={onSearchPaste}
          placeholder={searchPlaceholder}
          style={searchInputStyle}
        />
      </motion.div>

      <motion.div
        variants={staggerItem}
        role="listbox"
        style={{
          ...listStyle,
          background: v.hoverBg,
          borderColor: v.border,
          opacity: loading ? 0.6 : 1,
          // Only once there is more than one page: a two-entry vocabulary
          // should not sit in six rows of empty box.
          minHeight: pageable ? PER_PAGE * ROW_HEIGHT : undefined,
        }}
      >
        {note ? (
          <div style={noteStyle}>{note}</div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={listKey}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={PAGE_SPRING}
            >
              {pageRows.map((row, i) => {
                const index = (page - 1) * PER_PAGE + i;
                return (
                  <button
                    key={row.create ? "__create" : row.value}
                    type="button"
                    role="option"
                    aria-selected={Boolean(row.selected)}
                    onMouseEnter={() => onActiveChange(index)}
                    onClick={() => onCommit(row)}
                    style={{
                      ...rowStyle,
                      ...(index === active && !row.selected ? { background: v.hoverBg } : null),
                      ...(row.selected ? v.selected : null),
                    }}
                  >
                    {row.create ? <Plus size={12} style={{ flexShrink: 0, color: ACCENT }} /> : null}
                    <span style={rowLabelStyle}>{row.display ?? row.label}</span>
                    {row.hint ? <span style={hintStyle}>{row.hint}</span> : null}
                    {row.selected ? <Check size={12} style={{ flexShrink: 0, color: ACCENT }} /> : null}
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>

      {showFooter ? (
        <motion.div variants={staggerItem} style={footRowStyle}>
          {/* Clearing lives here rather than as a row in the list: as a row it
              took a slot from the options, and picking it shortened the list by
              one on the way out. */}
          {onClear && clearActive && clearLabel ? (
            <TextButton onClick={onClear} hoverBg={v.hoverBg}>{clearLabel}</TextButton>
          ) : <span />}

          {pageable ? (
            <div style={pagerStyle}>
              <PagerButton onClick={() => turnTo(page - 1)} disabled={page <= 1} label={prevPageLabel} palette={v}>
                <ChevronLeft size={14} />
              </PagerButton>
              <span style={pageCountStyle}>{page} / {totalPages}</span>
              <PagerButton onClick={() => turnTo(page + 1)} disabled={page >= totalPages} label={nextPageLabel} palette={v}>
                <ChevronRight size={14} />
              </PagerButton>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </>
  );
}

/** @param {{ onClick: () => void, hoverBg: string, children: React.ReactNode }} props */
function TextButton({ onClick, hoverBg, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{ ...textBtnStyle, background: lit ? hoverBg : "transparent", opacity: lit ? 1 : 0.6 }}
    >
      {children}
    </button>
  );
}

/**
 * @param {{
 *   onClick: () => void, disabled: boolean, label: string,
 *   palette: *, children: React.ReactNode,
 * }} props
 */
function PagerButton({ onClick, disabled, label, palette: v, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = (hovered || focused) && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      {...handlers}
      style={{
        ...pagerBtnStyle,
        borderColor: v.border,
        background: lit ? v.hoverBg : "transparent",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ---- Styles ---------------------------------------------------------------

const searchRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  borderRadius: R_SM,
  borderWidth: 1,
  borderStyle: "solid",
  flexShrink: 0,
};
const searchInputStyle = {
  flex: 1,
  minWidth: 0,
  font: "inherit",
  fontSize: FS_SM,
  fontWeight: 400,
  padding: "8px 0",
  border: "none",
  background: "transparent",
  color: "inherit",
  outline: "none",
};
const listStyle = {
  borderRadius: R_SM,
  borderWidth: 1,
  borderStyle: "solid",
  padding: 4,
  minWidth: 0,
  // `popLayout` takes the outgoing page out of flow, so this has to be the box
  // it positions against, and the one that clips it on its way out.
  position: "relative",
  overflow: "hidden",
  transition: `opacity ${DUR_FAST} ${EASE}`,
};
const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "7px 9px",
  border: "none",
  borderRadius: R_SM - 2,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: FS_SM,
  // Stated so the selected row's own weight is a swap, not an addition; see
  // `selected` in editors/styles.js.
  fontWeight: 400,
  textAlign: "left",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}`,
};
const rowLabelStyle = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const noteStyle = { padding: "12px 8px", fontSize: FS_SM, opacity: 0.45, textAlign: "center" };
const hintStyle = { flexShrink: 0, fontSize: FS_XS, opacity: 0.45 };
const footRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  // Holds the row open when neither slot has anything in it, so clearing a
  // value does not take a strip of panel with it.
  minHeight: 26,
};
const pagerStyle = { display: "flex", alignItems: "center", gap: 8 };
const textBtnStyle = {
  padding: "5px 9px",
  border: "none",
  borderRadius: R_SM - 2,
  color: "inherit",
  font: "inherit",
  fontSize: FS_MICRO,
  fontWeight: 500,
  letterSpacing: "0.02em",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}, opacity ${DUR_FAST} ${EASE}`,
};
const pagerBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: R_SM - 2,
  borderWidth: 1,
  borderStyle: "solid",
  color: "inherit",
  padding: 0,
  transition: `background-color ${DUR_FAST} ${EASE}, opacity ${DUR_FAST} ${EASE}`,
};
const pageCountStyle = {
  fontSize: FS_MICRO,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  opacity: 0.45,
  fontVariantNumeric: "tabular-nums",
};
