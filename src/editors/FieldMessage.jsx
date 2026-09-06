"use client";

/**
 * @file The one line a field says something on, under its control.
 *
 * Every editor used to answer this its own way: `LinkEditor` painted a warning
 * inline, `ImageEditor` built a dismissable error box, `ListEditor` dropped a
 * bare `<div>`, and `FieldEditor` had two more. Same kind of sentence, five
 * shapes. The appearance lives in `field-css.js` under `.inscribed-field-msg`,
 * so it reads the same on the dark drawer and on a light host page.
 *
 * Not for anything that asks a question. A conflict and a translation prompt
 * are decisions the editor has to make before the field is usable, so those
 * stay panels (`BlockNotice`) above the control rather than a line below it.
 */

/**
 * @param {{
 *   tone?: "hint" | "warn" | "danger" | "accent",
 *   icon?: React.ReactNode,
 *   role?: string,
 *   children: React.ReactNode,
 * }} props
 *   `tone` defaults to `hint`. Pass `role="alert"` for something that arrived
 *   in response to an action (a failed upload), not for a standing note.
 */
export function FieldMessage({ tone = "hint", icon, role, children }) {
  return (
    <span className={`inscribed-field-msg${tone === "hint" ? "" : ` is-${tone}`}`} role={role}>
      {icon ?? null}
      <span>{children}</span>
    </span>
  );
}
