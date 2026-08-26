"use client";

/**
 * @file Date field editor. Value shape: ISO 8601 string, e.g. "2026-08-15T18:00:00.000Z".
 */

import { FieldShell } from "./FieldShell.jsx";
import { DatePicker } from "./DatePicker.jsx";
import { fieldVariant } from "../styles.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";

/**
 * @param {Object} props
 * @param {string|null|undefined} props.value  ISO 8601 string
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.countdown]
 *   On by default: show how long is left until the date. Off where a date is
 *   just a value (a record's publish date) rather than a deadline the editor is
 *   watching.
 * @param {React.ReactNode} [props.label]  Overrides the built-in caption.
 * @param {string|null} [props.help]
 * @param {boolean} [props.hideLabel]  Drop the caption when a parent already
 *   labels the field.
 * @param {import("../styles.js").FieldVariantName} [props.variant]
 */
export function DateEditor({
  value, onChange, disabled, countdown = true, label, help, hideLabel, variant,
}) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const remaining = countdown && value ? calcRemaining(value) : null;

  const input = (
    <DatePicker value={value} onChange={onChange} disabled={disabled} variant={variant} />
  );

  const field = hideLabel ? input : (
    <FieldShell label={label ?? t("editors.date.label")} help={help} variant={variant}>
      {input}
    </FieldShell>
  );

  if (!remaining) return field;

  // The countdown is the field's own help line, not a panel beside it: it is
  // read at a glance, and a bordered box around three figures outweighed the
  // date it describes. `v.label` puts it at the rhythm a real help line sits at,
  // flush with the field, where every other line under a field starts.
  return (
    <div style={v.label}>
      {field}
      <span style={{ ...v.help, fontVariantNumeric: "tabular-nums" }}>
        {remaining.past
          ? t("editors.date.past")
          : t("editors.date.remaining", { time: spellOut(remaining, t) })}
      </span>
    </div>
  );
}

/**
 * The figures, largest first. Leading zeroes are dropped: "37 mins" says what
 * "0 days 0 hours 37 mins" says, in a third of the line.
 *
 * @param {{ days: number, hours: number, minutes: number }} remaining
 * @param {import("../../shared/i18n/translate.js").Translate} t
 */
function spellOut({ days, hours, minutes }, t) {
  const parts = [];
  if (days > 0) parts.push(`${days} ${t("editors.date.days")}`);
  if (days > 0 || hours > 0) parts.push(`${hours} ${t("editors.date.hours")}`);
  parts.push(`${minutes} ${t("editors.date.minutes")}`);
  return parts.join(" ");
}

/** @param {string} iso */
function calcRemaining(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return { past: true, days: 0, hours: 0, minutes: 0 };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    past: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}
