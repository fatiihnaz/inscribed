"use client";

/**
 * @file Date field editor. Value shape: ISO 8601 string, e.g. "2026-08-15T18:00:00.000Z".
 */

import { FieldShell } from "./FieldShell.jsx";
import { fieldVariant } from "../styles.js";
import { ACCENT, TEXT_MUTED } from "../../shared/style/tokens.js";
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
    <input
      type="datetime-local"
      value={isoToLocal(value)}
      onChange={(e) => onChange(localToIso(e.target.value))}
      className="inscribed-field"
      disabled={disabled}
      style={{ ...v.field, colorScheme: v.colorScheme, ...(disabled ? v.disabled : null) }}
    />
  );

  const field = hideLabel ? input : (
    <FieldShell label={label ?? t("editors.date.label")} help={help} variant={variant}>
      {input}
    </FieldShell>
  );

  if (!remaining) return field;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {field}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ACCENT} 10%, transparent)`,
        borderRadius: 8,
      }}>
        {remaining.past ? (
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>{t("editors.date.past")}</span>
        ) : (
          [
            { n: remaining.days,    l: t("editors.date.days") },
            { n: remaining.hours,   l: t("editors.date.hours") },
            { n: remaining.minutes, l: t("editors.date.minutes") },
          ].map(({ n, l }) => (
            <div key={l} style={{ textAlign: "center", minWidth: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: ACCENT, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
              <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2, letterSpacing: "0.04em" }}>{l}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** @param {string|null|undefined} iso */
function isoToLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** @param {string} local */
function localToIso(local) {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** @param {string} iso */
function calcRemaining(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return { past: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    past: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}
