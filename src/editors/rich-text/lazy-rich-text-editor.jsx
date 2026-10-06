"use client";

/**
 * @file The rich text editor, loaded on first need so Tiptap stays out of the
 * eager chunks.
 *
 * Read with `use()` rather than `lazy()`: the promise writes its outcome onto
 * itself when it settles, so anything mounting after the module arrived renders
 * at once. A `lazy()` component suspends on its first render even when the
 * module is already there, and React 19 then holds the editor back for up to
 * 300 ms after the fallback, which made a shut drawer row open onto a
 * placeholder and jump to full height a moment later.
 */

import { use } from "react";

/** @type {(Promise<React.ComponentType<*>> & { status?: string, value?: *, reason?: * }) | null} */
let loading = null;

/**
 * Start the download, or hand back the one already under way.
 *
 * @returns {Promise<React.ComponentType<*>>}
 */
export function loadRichTextEditor() {
  if (!loading) {
    const promise = /** @type {NonNullable<typeof loading>} */ (
      import("./RichTextEditor.jsx").then((m) => m.RichTextEditor)
    );
    promise.then(
      (value) => { promise.status = "fulfilled"; promise.value = value; },
      (reason) => { promise.status = "rejected"; promise.reason = reason; },
    );
    loading = promise;
  }
  return loading;
}

/**
 * Start the download ahead of need. A failure here is not kept, so the next
 * load tries again rather than every rich text field throwing it.
 */
export function prefetchRichTextEditor() {
  const promise = loadRichTextEditor();
  promise.catch(() => {
    if (loading === promise) loading = null;
  });
}

/**
 * Suspends only until the module's first arrival; wrap it in `<Suspense>`.
 *
 * @param {*} props  `RichTextEditor`'s.
 */
export function LazyRichTextEditor(props) {
  const RichTextEditor = use(loadRichTextEditor());
  return <RichTextEditor {...props} />;
}
