"use client";

/**
 * @file Internal context carrying the active `<CmsGroup>` prefix down to
 * descendant `<EditableRegion>` / `<EditableList>` so they can prepend it to
 * their `blockPath`. Lives in `lib/` so both the publisher (CmsGroup) and the
 * readers can import it without a barrel cycle through `components/`.
 */

import { createContext } from "react";

/**
 * Null value means "no enclosing CmsGroup; use blockPath as-is".
 *
 * @type {React.Context<string | null>}
 */
export const CmsGroupContext = createContext(/** @type {string | null} */ (null));

/**
 * Carries the enclosing `<CmsGroup>`'s visibility mode down so a section-level
 * `visible` / `editable` prop cascades to every block inside. Separate from
 * `CmsGroupContext` so the prefix stays a bare string.
 *
 * Null means no inherited override. `"readonly"` locks descendants; `"hidden"`
 * drops them from the drawer.
 *
 * @type {React.Context<"hidden" | "readonly" | null>}
 */
export const CmsGroupVisibilityContext = createContext(
  /** @type {"hidden" | "readonly" | null} */ (null),
);

const VISIBILITY_RANK = /** @type {const} */ ({ readonly: 1, hidden: 2 });

/**
 * Resolve two visibility modes to the more restrictive one
 * (`hidden` > `readonly` > none). Folds a child's own `visible`/`editable`
 * prop with the inherited group mode, and combines nested groups.
 *
 * @param {"hidden"|"readonly"|null} a
 * @param {"hidden"|"readonly"|null} b
 * @returns {"hidden"|"readonly"|null}
 */
export function strongerVisibility(a, b) {
  const ra = a ? VISIBILITY_RANK[a] : 0;
  const rb = b ? VISIBILITY_RANK[b] : 0;
  return rb > ra ? b : a;
}
