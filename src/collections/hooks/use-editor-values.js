"use client";

/**
 * @file Reading a record editor's working copy back out of the collection
 * store.
 *
 * These three are readers, not machinery: they take an `editorId` and select a
 * slice. They sit apart from `useCollectionEditor` because the readers are on
 * the page's side of the split and the engine is not: `item-context.js` needs
 * `useEditorValues` so `useCollectionRecord()` shows an editor's live values,
 * and importing it from the editor module dragged the whole engine, and with it
 * the panel's string catalogs, into every public page that renders a record.
 *
 * `use-collection-editor.js` re-exports all three, so nothing that already
 * imported them from there has to move.
 */

import { useCollectionContext } from "../context.js";
import { useStoreSelector } from "../../shared/state/store.js";

/**
 * Whether a publish would send anything: the live overlay draft unioned with
 * the server's. A hook rather than a field on the editor state, because the
 * overlay flips on the first keystroke and the editor object must keep its
 * identity across one (it is what the record scope hangs off).
 *
 * @param {import("./use-collection-editor.js").CollectionEditorState} editor
 * @returns {boolean}
 */
export function useEditorDirty(editor) {
  const { collectionStore } = useCollectionContext();
  const hasLocalDraft = useStoreSelector(
    collectionStore,
    (s) => s.drafts.has(`${editor.collection}:${editor.slug}`),
  );
  return hasLocalDraft || editor.hasDraft;
}

/**
 * One surface's whole form state. For the drawer's schema-driven form, which
 * renders every field at once and so re-renders with any of them.
 *
 * @param {string | undefined} editorId
 * @returns {Record<string, *> | null}
 */
export function useEditorValues(editorId) {
  const { collectionStore } = useCollectionContext();
  return useStoreSelector(
    collectionStore,
    (s) => (editorId ? s.editorValues.get(editorId) ?? null : null),
  );
}

/**
 * One field of one surface. The narrow read is the point: typing in a record's
 * title must not re-render its body, image and the rest.
 *
 * @param {string | undefined} editorId
 * @param {string} name
 * @returns {*}
 */
export function useEditorField(editorId, name) {
  const { collectionStore } = useCollectionContext();
  return useStoreSelector(
    collectionStore,
    (s) => (editorId ? s.editorValues.get(editorId)?.[name] : undefined),
  );
}
