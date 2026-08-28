"use client";

/**
 * @file `<EditableChoice>`: a block whose value comes from a vocabulary.
 *
 * A `Select` stores a key, and the key is meaningless without the list it was
 * chosen from. `<EditableRegion>` has nowhere to put that list: it would be a
 * prop the other ten types never read, and a vocabulary is not rendering, it is
 * a declaration. So the type gets its own declaration site, the way
 * `ObjectArray` has `<EditableList>`.
 *
 * The vocabulary never enters the manifest and never goes over the wire. It is
 * the page's business and the drawer is its only reader, so it is registered at
 * runtime like a list's row schema.
 *
 *   <EditableChoice blockPath="durum" defaultValue="taslak"
 *                   source={{ kind: "static", values: ["taslak", "yayında"] }} />
 *
 * A `block` source points the list at another block on the page instead, which
 * makes the vocabulary content: an editor adds an option by editing that block.
 *
 *   <EditableChoice blockPath="one-cikan" defaultValue=""
 *                   source={{ kind: "block", blockPath: "haberler", labelField: "baslik" }} />
 *
 * It is resolved to a plain `static` source here, where the page context is,
 * rather than downstream in the picker. The picker is shared with the collection
 * form, which renders on host pages that have no block map to read, and it must
 * not start needing one.
 *
 * TODO: the source is still written in code, so changing it means a deploy and a
 * sync. The step after this is letting an editor point the field at a collection
 * from the panel, which needs somewhere per-block to store that choice; a
 * `block` source is the half of it that needs no backend at all.
 */

import { useContext, useMemo } from "react";

import { EditableRegion } from "./EditableRegion.jsx";
import { CmsGroupContext } from "../shared/state/group-context.js";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useStoreSelector } from "../shared/state/store.js";
import { useCmsRoute } from "./hooks/use-cms-route.js";
import { useDeclaredChoiceSource } from "./hooks/use-declared-choice-source.js";

/**
 * @import { ChoiceSource } from "../shared/contracts/schemas.js"
 */

/**
 * @typedef {ChoiceSource | { kind: "block", blockPath: string, labelField?: string }} ChoicePropSource
 */

/**
 * @param {Object} props
 * @param {string} props.blockPath  Auto-prefixed under a `<CmsGroup>`.
 * @param {ChoicePropSource} props.source
 *   Where the options come from. `static` carries them itself; `block` reads
 *   them off another block on this page (a `StringArray`'s entries, or one field
 *   of an `ObjectArray`'s rows, named by `labelField`).
 * @param {(value: *) => React.ReactNode} [props.children]
 *   Renders the stored value your own way. Left out, the region prints it, which
 *   is right whenever the option is its own label.
 * @param {*} [props.defaultValue]  Discovery metadata, as on a region.
 * @param {"global"} [props.scope]  Discovery-only.
 * @param {string} [props.as]
 * @param {boolean} [props.hidden]
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.editable]
 * @param {boolean} [props.visible]
 */
export function EditableChoice({ blockPath, source, children, ...rest }) {
  const groupPrefix = useContext(CmsGroupContext);
  // Registered against the prefixed path, since that is what the drawer keys by.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  useDeclaredChoiceSource(fullPath, useResolvedSource(source));

  // Everything else is a region: same chrome, same draft subscription, same
  // group and visibility rules. Only the vocabulary is ours.
  return (
    <EditableRegion blockPath={blockPath} blockType="Select" {...rest}>
      {children}
    </EditableRegion>
  );
}

/**
 * A `block` source turned into the static list it stands for. Any other kind
 * passes through untouched.
 *
 * The subscription is the point: the source block is editable content, so when
 * an editor adds an entry to it this re-registers and the picker offers the new
 * option without a reload.
 *
 * @param {ChoicePropSource} source
 * @returns {ChoiceSource}
 */
function useResolvedSource(source) {
  const { blocksStore } = useCmsContext();
  const { pathname } = useCmsRoute();

  const from = source?.kind === "block" ? source.blockPath : null;
  const labelField = source?.kind === "block" ? source.labelField : undefined;
  // Global-scope blocks are fetched alongside the page and merged into the same
  // map, so "this page plus the global ones" is just the current route's map.
  const sourceValue = useStoreSelector(
    blocksStore,
    (m) => (from ? m.get(pathname)?.get(from)?.value ?? null : null),
  );

  return useMemo(
    () => (from ? { kind: "static", values: optionsFromBlock(sourceValue, labelField) } : source),
    // `source` is written inline by callers, so a new identity every render is
    // normal; the registration below keys on its shape rather than on this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, labelField, sourceValue, source],
  );
}

/**
 * The options a source block offers. A `StringArray` block is already the list;
 * an `ObjectArray` needs `labelField` to say which column is the option.
 *
 * That field's value is what gets stored, never a row index: rows have no
 * identity, so reordering the source list cannot repoint a reference, and
 * deleting a row leaves the stored text standing rather than silently moving it
 * to a neighbour.
 *
 * Blanks and duplicates drop out. A half-filled row is not an option anyone can
 * pick meaningfully, and two identical entries would store the same value twice.
 *
 * @param {*} value  The source block's value, or null when it is not on the page.
 * @param {string} [labelField]
 * @returns {string[]}
 */
function optionsFromBlock(value, labelField) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const entry of value) {
    const raw = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && labelField
        ? entry[labelField]
        : null;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text) seen.add(text);
  }
  return [...seen];
}
