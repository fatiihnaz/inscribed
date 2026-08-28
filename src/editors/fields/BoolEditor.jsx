"use client";

/**
 * @file Yes/no field editor, drawn as a switch. Its own row layout rather than
 * `FieldShell`'s stack: a switch reads as a setting, with the caption beside it
 * instead of above it.
 *
 * The checkbox stays in the tree (visually hidden) so the control keeps native
 * keyboard and screen-reader behaviour; the track is decoration, and reads its
 * checked and focus states off the input in CSS.
 *
 * With no caption of its own (the drawer, where the block card already names the
 * field) there is no row to lay out and the switch is the whole control, so it
 * sits at the left like every other field instead of being pushed to the far
 * edge by an empty column.
 */

import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   value: boolean | null | undefined,
 *   onChange: (value: boolean) => void,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   hideLabel?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function BoolEditor({ value, onChange, disabled, label, help, hideLabel, variant }) {
  const v = fieldVariant(variant);
  const caption = hideLabel
    ? null
    : typeof label === "string" ? <span style={v.labelText}>{label}</span> : label;
  const hasText = Boolean(caption || (help && !hideLabel));

  return (
    <label
      className={v.className}
      style={{
        ...switchRowStyle,
        ...(hasText ? null : bareRowStyle),
        ...(disabled ? disabledRowStyle : null),
      }}
    >
      {hasText && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {caption}
          {help ? <span style={v.help}>{help}</span> : null}
        </div>
      )}
      <input
        type="checkbox"
        className="inscribed-switch-input"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={hiddenInputStyle}
      />
      <span className="inscribed-switch" />
    </label>
  );
}

// ---- Styles ---------------------------------------------------------------

const switchRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 0",
  cursor: "pointer",
};
// Shrink to the switch: a full-width label with nothing in it is a wide
// invisible toggle target across the panel. No vertical padding either, since
// the row it rides in (the drawer's label line) sets the rhythm.
const bareRowStyle = { display: "inline-flex", justifyContent: "flex-start", padding: 0 };
const disabledRowStyle = { opacity: 0.5, cursor: "not-allowed" };
const hiddenInputStyle = { position: "absolute", opacity: 0, width: 0, height: 0 };
