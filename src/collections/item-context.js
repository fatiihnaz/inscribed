"use client";

/**
 * @file Internal context carrying the enclosing `<CollectionItem>`'s record
 * down to `<CollectionField>`: which record it is, its resolved data, and the
 * editor driving it (null for anyone who can't edit).
 *
 * Kept beside the collection components rather than inside one of them, so the
 * publisher (CollectionItem) and the reader (CollectionField) meet on a module
 * neither owns.
 */

import { createContext, useContext } from "react";

// Imported from the editor module rather than the other way round: the editor
// owns where its values live, this is only a reader.
import { useEditorValues } from "./hooks/use-collection-editor.js";

/**
 * @import { CollectionItemResponse } from "../shared/contracts/schemas.js"
 * @import { CollectionEditorState } from "./hooks/use-collection-editor.js"
 */

/**
 * @typedef {Object} CollectionItemScope
 * @property {string} collection
 * @property {string} slug
 * @property {string} scopeId
 *   Identifies this `<CollectionItem>` among any others bound to the same
 *   record, so the provider can pick one of them to drive the shared draft.
 * @property {CollectionItemResponse | null} item
 *   Draft-overlaid, so a field reads the same value the page renders. Null
 *   while the record loads and after an error.
 * @property {CollectionEditorState | null} editor
 *   The record's editor, mounted only for an admin who may edit it. Null
 *   otherwise, which is what makes a field render read-only.
 */

/** @type {React.Context<CollectionItemScope | null>} */
export const CollectionItemContext = createContext(
  /** @type {CollectionItemScope | null} */ (null),
);

/**
 * Read the enclosing record. Throws outside `<CollectionItem>`, where a field
 * has no record to name.
 *
 * Internal: the whole scope, editor included. Consumers get the narrow
 * `useCollectionRecord` below instead.
 *
 * @returns {CollectionItemScope}
 */
export function useCollectionItemScope() {
  const scope = useContext(CollectionItemContext);
  if (!scope) {
    throw new Error(
      "<CollectionField> must be rendered inside a <CollectionItem>'s children.",
    );
  }
  return scope;
}

/**
 * One record's identity and values, for markup that has to *compute* with them
 * rather than render a field: a link built from the slug, a conditional, a
 * formatted date. `<CollectionField>` covers the render-it case; this covers the
 * rest, and it is why the binding components need no render-prop.
 *
 * Client-only, so reach for it in a small `"use client"` component nested inside
 * the record:
 *
 *   "use client";
 *   export function NewsCardLink({ children }) {
 *     const { slug } = useCollectionRecord();
 *     return <Link href={`/news/${slug}`}>{children}</Link>;
 *   }
 *
 * `data` is draft-overlaid, so an editor sees what they are typing and a visitor
 * sees what is published. Empty (`{}`) while the record loads.
 *
 * @returns {{ collection: string, slug: string, data: Record<string, *> }}
 */
export function useCollectionRecord() {
  const { collection, slug, item, editor } = useCollectionItemScope();
  // An open editor holds the live values; without one the overlaid item is
  // already the effective record. This subscribes to the whole record on
  // purpose, unlike `<CollectionField>`: a caller computing with the data has
  // no single field to narrow to.
  const values = useEditorValues(editor?.editorId);
  const data = values ?? item?.data ?? {};
  return { collection, slug, data };
}
