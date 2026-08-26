"use client";

/**
 * @file Single-choice editor for a field that picks from a source.
 *
 * The control is the shared `Combobox`, so a field whose choices are a fixed
 * list and one that points at another collection's records are the same editor
 * with a different feeder. Clearing is a row in the list rather than a button on
 * the trigger: an optional field has to be able to go back to unset.
 */

import { FieldShell } from "./FieldShell.jsx";
import { Combobox } from "./Combobox.jsx";
import { useChoiceSource } from "./use-choice-source.js";

/**
 * @import { ChoiceSource } from "../../shared/contracts/schemas.js"
 */

/**
 * @param {{
 *   value: string | null | undefined,
 *   onChange: (value: string) => void,
 *   source: ChoiceSource | null | undefined,
 *   allowCustom?: boolean,
 *   placeholder?: string,
 *   locale?: string | null,
 *   disabled?: boolean,
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   hideLabel?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 */
export function SelectEditor({
  value, onChange, source, allowCustom, placeholder, locale,
  disabled, label, help, hideLabel, variant,
}) {
  const { items, search, loading } = useChoiceSource(source, { locale });

  const control = (
    <Combobox
      items={items}
      value={value ?? ""}
      onPick={onChange}
      onClear={() => onChange("")}
      onCreate={allowCustom ? onChange : undefined}
      onSearch={search}
      loading={loading}
      placeholder={placeholder}
      disabled={disabled}
      variant={variant}
    />
  );

  if (hideLabel) return control;
  return <FieldShell label={label} help={help} variant={variant}>{control}</FieldShell>;
}
