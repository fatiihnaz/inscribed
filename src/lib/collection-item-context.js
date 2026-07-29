"use client";

/**
 * @file Internal context carrying the enclosing `<CollectionItem>`'s record
 * down to `<CollectionField>`: which record it is, its resolved data, and the
 * editor driving it (null for anyone who can't edit).
 *
 * Lives in `lib/` so the publisher (CollectionItem) and the reader
 * (CollectionField) can import it without a barrel cycle through
 * `components/`, same as `group-context.js`.
 */

import { createContext, useContext } from "react";

/**
 * @import { CollectionItemResponse } from "./schemas.js"
 * @import { CollectionEditorState } from "../components/AdminCollectionEditor.jsx"
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
