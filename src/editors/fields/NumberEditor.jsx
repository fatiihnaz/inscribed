"use client";

/**
 * @file Numeric field editor. Value is a number, or `null` when the box is
 * cleared: an empty numeric input means "unset", not zero.
 *
 * Carries its own stepper. The browser's spinners cannot be styled, only
 * removed, and they looked like a control from a different product sitting
 * inside ours.
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { ChevronDown, ChevronUp } from "../../shared/style/icons.jsx";

/**
 * @param {{
 *   value: number | null | undefined,
 *   onChange: (value: number | null) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function NumberEditor({ value, onChange, disabled, label, help, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  // An unset field steps from zero, so the first press gives 1 or -1 rather
  // than doing nothing.
  const step = (/** @type {number} */ by) => onChange((value ?? 0) + by);

  return (
    <FieldShell label={label} help={help} variant={variant}>
      <div className={v.className} style={{ position: "relative" }}>
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          onWheel={(e) => {
            // A focused number input treats the wheel as a stepper, so scrolling
            // the drawer over one would rewrite the value in passing.
            if (document.activeElement === e.currentTarget) e.currentTarget.blur();
          }}
          disabled={disabled}
          className="inscribed-field"
          style={{ width: "100%", paddingRight: 30, fontVariantNumeric: "tabular-nums" }}
        />
        <div className="inscribed-stepper">
          <button type="button" disabled={disabled} onClick={() => step(1)} aria-label={t("editors.number.increment")}>
            <ChevronUp size={11} />
          </button>
          <button type="button" disabled={disabled} onClick={() => step(-1)} aria-label={t("editors.number.decrement")}>
            <ChevronDown size={11} />
          </button>
        </div>
      </div>
    </FieldShell>
  );
}
