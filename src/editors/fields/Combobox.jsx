"use client";

/**
 * @file Searchable picker shared by every field that chooses from a list.
 *
 * Deliberately ignorant of where the choices come from. It takes a resolved
 * `items` array, an optional `onSearch` for sources that answer over the wire,
 * and an optional `onCreate` for the entry that is not on the list yet. That is
 * what lets one component serve a fixed vocabulary today and a field pointing at
 * another collection's records later, without being rewritten in between.
 *
 * Two modes. `select` shows the current choice and closes on pick; `add` is an
 * affordance that stays open, for a caller that keeps its own list of what has
 * been picked so far (tags).
 *
 * The list is paged, not scrolled: a scrolling list inside a floating panel
 * gives the pointer two scroll surfaces to hit and hides how much is left,
 * where a fixed page keeps the panel one height and says "2 / 5" out loud.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { ChevronDown, Plus, X } from "../../shared/style/icons.jsx";
import { Popover } from "../../shared/ui/Popover.jsx";
import { staggerGroup } from "../../shared/ui/panel-motion.js";
import { useInteractive } from "../../shared/ui/use-interactive.js";
import { fieldVariant } from "../styles.js";
import { SearchPicker } from "./SearchPicker.jsx";
import {
  DUR_BASE, DUR_FAST, EASE, R_SM, R_MD,
} from "../../shared/style/tokens.js";

const SEARCH_DEBOUNCE_MS = 200;

/**
 * @typedef {Object} ComboboxItem
 * @property {string} value   What gets stored.
 * @property {string} label   What the editor reads.
 * @property {string} [hint]  Secondary line, e.g. a slug or a category.
 */

/**
 * @param {{
 *   items: ComboboxItem[],
 *   value?: string | null,
 *   onPick: (value: string) => void,
 *   mode?: "select" | "add",
 *   placeholder?: string,
 *   onSearch?: (query: string) => void,
 *   loading?: boolean,
 *   onCreate?: (text: string) => void,
 *   onClear?: () => void,
 *   disabled?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   Pass `onSearch` when the source answers remotely: `items` is then taken as
 *   already filtered and no local matching happens.
 */
export function Combobox({
  items, value, onPick, mode = "select", placeholder,
  onSearch, loading, onCreate, onClear, disabled, variant,
}) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The keyboard cursor is the only page state there is: which page shows is
  // derived from it, so walking off the end of one turns to the next instead of
  // the two drifting apart.
  const [active, setActive] = useState(0);
  const wrapRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const btnRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const trigger = useInteractive();

  const remote = Boolean(onSearch);
  const trimmed = query.trim();

  // A remote source has already matched server-side; filtering again here would
  // hide rows it deliberately returned.
  const matches = useMemo(() => {
    if (remote || !trimmed) return items;
    const q = trimmed.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, trimmed, remote]);

  const exact = matches.some((i) => i.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !exact;

  /** @type {(ComboboxItem & { create?: boolean })[]} */
  const rows = [
    ...matches,
    ...(canCreate ? [{ value: "", label: trimmed, create: true }] : []),
  ];

  // Panel-local state resets as the panel opens, never as it closes: the exit
  // animation still has the old rows on screen, and clearing the query out from
  // under them swaps the list mid-fade.
  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!onSearch || !open) return undefined;
    const id = setTimeout(() => onSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [onSearch, open, trimmed]);

  // Reset rather than clamp: after a new search the old index points at a row
  // the editor never saw.
  useEffect(() => { setActive(0); }, [trimmed, items]);

  const selected = value ? items.find((i) => i.value === value) : null;

  /** @param {ComboboxItem & { create?: boolean }} row */
  const commit = (row) => {
    if (!row) return;
    if (row.create) onCreate?.(row.label);
    else onPick(row.value);
    if (mode === "select") {
      setOpen(false);
      btnRef.current?.focus();
    } else {
      setQuery("");
    }
  };

  /** @param {React.KeyboardEvent<HTMLInputElement>} e */
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(rows[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // A pasted block of lines is a list, not one entry: match each line against
  // the vocabulary and create the rest. Saves retyping twenty tags one by one.
  /** @param {React.ClipboardEvent<HTMLInputElement>} e */
  const onPaste = (e) => {
    if (mode !== "add") return;
    const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    for (const line of lines) {
      const hit = items.find((i) => i.label.toLowerCase() === line.toLowerCase());
      if (hit) onPick(hit.value);
      else onCreate?.(line);
    }
    setQuery("");
  };

  const adding = mode === "add";
  const triggerLabel = adding
    ? (placeholder ?? t("editors.combobox.add"))
    : (selected?.label ?? value ?? placeholder ?? t("editors.combobox.choose"));
  const isPlaceholder = adding || (!selected?.label && !value);
  const showClear = !adding && Boolean(value) && Boolean(onClear) && !disabled;
  const lit = open || trigger.focused;
  const note = loading
    ? t("editors.combobox.loading")
    : rows.length === 0 ? t("editors.combobox.empty") : null;
  const canClear = Boolean(onClear) && Boolean(value);

  const pickerRows = rows.map((row) => ({
    ...row,
    display: row.create ? t("editors.combobox.create", { text: row.label }) : undefined,
    selected: !row.create && row.value === value,
  }));

  return (
    <>
      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          {...trigger.handlers}
          style={{
            ...v.field,
            ...(disabled ? v.disabled : null),
            ...(trigger.hovered && !disabled ? { background: v.hoverBg } : null),
            ...(lit ? { borderColor: v.focusBorder, boxShadow: v.focusShadow } : null),
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            // Room for the chevron and clear button, which sit over the trigger
            // rather than inside it: a button nested in a button is invalid.
            paddingRight: adding ? undefined : (showClear ? 52 : 30),
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "left",
            transition: `box-shadow ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE}`,
          }}
        >
          {adding ? <Plus size={13} style={{ flexShrink: 0, opacity: 0.55 }} /> : null}
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: isPlaceholder ? 0.5 : 1 }}>
            {triggerLabel}
          </span>
        </button>

        {adding ? null : (
          <ChevronDown
            size={14}
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 11,
              top: "50%",
              marginTop: -7,
              pointerEvents: "none",
              opacity: disabled ? 0.25 : 0.45,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: `transform ${DUR_BASE} ${EASE}`,
            }}
          />
        )}

        {showClear ? (
          <ClearButton label={t("editors.combobox.clear")} hoverBg={v.hoverBg} onClick={() => onClear?.()} />
        ) : null}
      </div>

      <Popover anchorRef={wrapRef} open={open} onClose={() => setOpen(false)} matchWidth maxHeight={400}>
        <motion.div variants={staggerGroup} style={{ ...v.panel, ...panelStyle }}>
          <SearchPicker
            rows={pickerRows}
            active={active}
            onActiveChange={setActive}
            onCommit={commit}
            note={note}
            loading={loading}
            searchValue={query}
            onSearchChange={setQuery}
            onSearchKeyDown={onKeyDown}
            onSearchPaste={onPaste}
            searchPlaceholder={t("editors.combobox.search")}
            inputRef={inputRef}
            clearLabel={t("editors.combobox.clearAction")}
            onClear={onClear ? () => { onClear(); setOpen(false); } : null}
            clearActive={canClear}
            prevPageLabel={t("editors.combobox.prevPage")}
            nextPageLabel={t("editors.combobox.nextPage")}
            palette={v}
          />
        </motion.div>
      </Popover>
    </>
  );
}

/** @param {{ label: string, hoverBg: string, onClick: () => void }} props */
function ClearButton({ label, hoverBg, onClick }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...handlers}
      style={{
        position: "absolute",
        right: 29,
        top: "50%",
        marginTop: -9,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        padding: 0,
        border: "none",
        borderRadius: R_SM - 2,
        background: lit ? hoverBg : "transparent",
        color: "inherit",
        opacity: lit ? 0.9 : 0.4,
        cursor: "pointer",
        transition: `opacity ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE}`,
      }}
    >
      <X size={12} />
    </button>
  );
}

// ---- Styles ---------------------------------------------------------------

const panelStyle = {
  borderRadius: R_MD + 4,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 0,
};
