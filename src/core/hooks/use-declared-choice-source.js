"use client";

/**
 * @file Hands the drawer the choices a `Select` or `StringArray` block was
 * declared with.
 *
 * The vocabulary is the page's business, not the backend's: it never enters the
 * manifest and never goes over the wire, so the only way the drawer can learn it
 * is a runtime registration from whoever declared the block. Both declaration
 * sites route through here so there is one lifecycle rather than two.
 */

import { useEffect, useRef } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";

/**
 * @param {string} blockPath  Already group-prefixed.
 * @param {import("../../shared/contracts/schemas.js").ChoiceSource} [source]
 * @param {boolean} [allowCustom]
 */
export function useDeclaredChoiceSource(blockPath, source, allowCustom) {
  const { isAdmin, registerChoiceSource, unregisterChoiceSource } = useCmsContext();

  // Keyed on the source's shape, not its identity: callers write it inline, so
  // an unchanged literal would otherwise unregister and re-register on every
  // render of the component holding it. Same reasoning as `<EditableList>`.
  const sourceKey = source ? stableStringify(source) : null;
  const entryRef = useRef(/** @type {*} */ (null));
  entryRef.current = source ? { source, allowCustom } : null;

  useEffect(() => {
    // Nothing reads the registry outside the drawer, so a public visitor pays
    // nothing for a declaration meant for editors.
    if (!isAdmin || !entryRef.current) return undefined;
    registerChoiceSource(blockPath, entryRef.current);
    return () => unregisterChoiceSource(blockPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, blockPath, sourceKey, allowCustom, registerChoiceSource, unregisterChoiceSource]);
}
