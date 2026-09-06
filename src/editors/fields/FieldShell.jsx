"use client";

/**
 * @file The caption + help-text frame a field editor draws around its control,
 * so every editor labels itself the same way instead of each caller stacking
 * its own label row.
 *
 * The help line goes through `FieldMessage`, which is where every other thing a
 * field says now lives. It used to be a span with the palette's own `help`
 * style, which meant a hint under a collection field and a warning under the
 * same field two lines later were two different shapes.
 */

import { FieldMessage } from "../FieldMessage.jsx";
import { fieldVariant } from "../styles.js";

/**
 * @param {{
 *   label?: React.ReactNode,
 *   help?: string | null,
 *   variant?: import("../styles.js").FieldVariantName,
 *   as?: "label" | "div",
 *   children: React.ReactNode,
 * }} props
 *   A string `label` gets the palette's caption treatment; a node is rendered
 *   as-is, which is how the collection form passes its required/readOnly
 *   chrome. Use `as="div"` for editors that nest labelled parts of their own
 *   (Image, RichText, the repeatable ones): inside a `<label>` the caption
 *   would bind to whichever control the browser reaches first.
 */
export function FieldShell({ label, help, variant, as: Tag = "label", children }) {
  const v = fieldVariant(variant);
  const caption = typeof label === "string"
    ? <span style={v.labelText}>{label}</span>
    : label;

  return (
    <Tag style={v.label}>
      {caption ?? null}
      {children}
      {help ? <FieldMessage>{help}</FieldMessage> : null}
    </Tag>
  );
}
