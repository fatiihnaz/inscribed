"use client";

/**
 * @file The slug input a `UserDefined` collection needs while creating a record.
 *
 * Its own file, not part of `CollectionFieldsForm`: the slug addresses the
 * record rather than living in its data, so it must not reach `buildPayload`,
 * and the backend's new-item draft slot doesn't store it either. The pane
 * holding this is the only place it lives until publish.
 */

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { fieldVariant } from "../editors/styles.js";
import { COLLECTION_ACCENT, FS_XS } from "../shared/style/tokens.js";

/**
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   disabled?: boolean,
 *   variant?: import("../editors/styles.js").FieldVariantName,
 * }} props
 *   `variant` matches the record form this sits above, so the address field and
 *   the fields under it are one form rather than two palettes stacked.
 */
export function SlugField({ value, onChange, disabled, variant = "neutral" }) {
  const t = useCmsStrings();
  const palette = fieldVariant(variant);
  return (
    <label style={palette.label}>
      <span style={palette.labelRow}>
        <span style={palette.labelText}>{t("collections.slugLabel")}</span>
        <span style={requiredMarkStyle} aria-label={t("collections.requiredField")}>*</span>
      </span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        placeholder={t("collections.slugPlaceholder")}
        className={`inscribed-field ${palette.className}`.trim()}
      />
    </label>
  );
}

const requiredMarkStyle = {
  color: COLLECTION_ACCENT,
  fontSize: FS_XS,
  fontWeight: 700,
  lineHeight: 1,
};
