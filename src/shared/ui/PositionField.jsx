"use client";

/**
 * @file The position readout on a list item, editable in place: double-click,
 * type a seat number, press Enter. The only way to carry item 100 to position 4
 * without a hundred arrow presses.
 *
 * The page row and the drawer card read very differently, so the styling stays
 * with each caller and only the behaviour lives here.
 */

import { useEffect, useRef, useState } from "react";

/**
 * @param {Object} props
 * @param {number} props.index                 Zero-based.
 * @param {number} props.total
 * @param {(index: number) => void} props.onMoveTo   Zero-based destination.
 * @param {string} props.label                 Title/aria text for the readout.
 * @param {string} props.editLabel             Accessible name while editing.
 * @param {React.ReactNode} props.children     The readout, e.g. "2/5" or "2".
 * @param {React.CSSProperties} props.style
 * @param {React.CSSProperties} props.inputStyle
 * @param {boolean} [props.disabled]
 */
export function PositionField({
  index, total, onMoveTo, label, editLabel, children, style, inputStyle, disabled,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const seat = Number.parseInt(draft, 10);
    if (!Number.isFinite(seat)) return;
    const target = Math.max(0, Math.min(seat - 1, total - 1));
    if (target !== index) onMoveTo(target);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={editLabel}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        onBlur={commit}
        style={inputStyle}
      />
    );
  }

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      title={label}
      aria-label={disabled ? undefined : `${label}. ${editLabel}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={disabled ? undefined : () => {
        setDraft(String(index + 1));
        setEditing(true);
      }}
      // Double-click has no keyboard equivalent, so Enter opens it too.
      onKeyDown={disabled ? undefined : (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        setDraft(String(index + 1));
        setEditing(true);
      }}
      style={{ ...style, cursor: disabled ? "inherit" : "text", userSelect: "none" }}
    >
      {children}
    </span>
  );
}
