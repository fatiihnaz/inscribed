"use client";

/**
 * @file Yes/no field editor, drawn as a switch inside the field frame.
 *
 * The switch used to ride the block card's label row, on the argument that it
 * is small and reads as a setting. That made it the one control in the drawer
 * with no frame around it and no fixed left edge, so a form of ten fields had
 * nine controls starting at one x and this one starting somewhere else. It sits
 * in the control lane now like everything else, and the frame carries the value
 * as a word beside it: a bare track says nothing about which end is on.
 *
 * The checkbox stays in the tree (visually hidden) so the control keeps native
 * keyboard and screen-reader behaviour; the track is decoration, and reads its
 * checked and focus states off the input in CSS.
 */

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { FieldShell } from "./FieldShell.jsx";
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
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const on = Boolean(value);

  const control = (
    <label
      className={`inscribed-field ${v.className}`.trim()}
      style={{ ...controlStyle, ...(disabled ? disabledStyle : null) }}
    >
      <span>{on ? t("editors.bool.on") : t("editors.bool.off")}</span>
      <input
        type="checkbox"
        className="inscribed-switch-input"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={hiddenInputStyle}
      />
      <span className="inscribed-switch" />
    </label>
  );

  if (hideLabel) return control;

  return (
    <FieldShell label={label} help={help} variant={variant} as="div">
      {control}
    </FieldShell>
  );
}

// ---- Styles ---------------------------------------------------------------

// The frame is `.inscribed-field`; only the row inside it is laid out here. The
// word takes the slack so the track always lands on the right edge, wherever
// the field is wide.
const controlStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
});

// The frame is a `<label>`, so `.inscribed-field:disabled` never matches it.
// Same variable the sheet dims a locked input with, so the two agree on both
// palettes.
const disabledStyle = /** @type {React.CSSProperties} */ ({
  cursor: "not-allowed",
  opacity: "var(--ins-f-dim, 0.55)",
});
const hiddenInputStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  opacity: 0,
  width: 0,
  height: 0,
});
