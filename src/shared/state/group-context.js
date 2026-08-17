"use client";

/**
 * @file Internal context carrying the active `<CmsGroup>` prefix down to
 * descendant `<EditableRegion>` / `<EditableList>` so they can prepend it to
 * their `blockPath`. Lives in `shared/` rather than beside `CmsGroup`: the
 * collections components read it too, and they sit above `core/`.
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

/**
 * Fold a component's own gate props into a visibility mode.
 *
 * `hidden` / `readOnly` are the current spelling; `visible` / `editable` are the
 * older one, still honoured. Both spellings are opt-outs (neither `visible` nor
 * `editable` ever loosened anything, which is why `=== false` and not truthiness),
 * so a component carrying both resolves most-restrictive-wins like everywhere
 * else. Kept here rather than inline in the three components so retiring the old
 * spelling is two deletions.
 *
 * @param {{ hidden?: boolean, readOnly?: boolean, visible?: boolean, editable?: boolean }} props
 * @returns {"hidden"|"readonly"|null}
 */
export function ownVisibility({ hidden, readOnly, visible, editable }) {
  if (hidden || visible === false) return "hidden";
  if (readOnly || editable === false) return "readonly";
  return null;
}
