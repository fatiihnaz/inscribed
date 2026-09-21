"use client";

/**
 * @file Registering a block's runtime `hidden` / `readOnly` override with the
 * drawer. Three components can declare one (`<EditableRegion>`,
 * `<EditableList>`, a collection record) and each had its own copy of this
 * effect.
 *
 * Deliberately kept out of the lazy admin half of those components: a hidden or
 * locked block draws no chrome at all, so this registration is the only thing
 * it still owes the drawer, and doing it here is what lets such a block skip
 * that chunk entirely.
 */

import { useEffect } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";

/**
 * @param {string} blockPath  Already group-prefixed.
 * @param {"hidden"|"readonly"|null} mode  Null registers nothing.
 */
export function useEditorVisibility(blockPath, mode) {
  const { isAdmin, registerEditorVisibility, unregisterEditorVisibility } = useCmsContext();
  useEffect(() => {
    // Nothing reads the registry outside the drawer, so a public visitor pays
    // nothing for a declaration meant for editors.
    if (!isAdmin || !mode) return undefined;
    registerEditorVisibility(blockPath, mode);
    return () => unregisterEditorVisibility(blockPath);
  }, [isAdmin, blockPath, mode, registerEditorVisibility, unregisterEditorVisibility]);
}
