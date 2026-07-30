"use client";

/**
 * @file Public client-side API for the optional Collections capability,
 * exposed as the `inscribed/collections` subpath. Collections are their own
 * namespace (provider, context, cache, API); the separate subpath keeps them
 * out of an app's graph when unused.
 *
 * `<CollectionProvider>` must live inside `<CmsProvider>`, which mounts it for
 * you automatically, so apps using only the components/hooks below don't have
 * to render it themselves.
 *
 * The top-level `"use client"` is load-bearing, same as in `index.js`: tsup
 * keeps only the entry file's directive, so Next.js needs it here.
 */

export { CollectionProvider } from "./components/CollectionProvider.jsx";
export { CollectionRegion } from "./components/CollectionRegion.jsx";
export { CollectionItem } from "./components/CollectionItem.jsx";

// The client half of the server-rendered binding components. Exported
// individually, and passed to `createCmsPage({ collections })` rather than
// imported there, for the same reason as `Provider`: only a module's own exports
// become client references across the RSC boundary, so a component smuggled
// inside a plain object arrives undefined on the server. Internals as far as an
// app is concerned; they appear here only to be wired up.
export { CollectionRecord } from "./components/CollectionItem.jsx";
export { CollectionRows } from "./components/CollectionRegion.jsx";
// Edits one text field of the enclosing <CollectionItem> in place; anything
// else about the record stays in the drawer's schema form.
export { CollectionField } from "./components/CollectionField.jsx";
// Chrome-free "add one item" form the host mounts on its own page; renders
// nothing for visitors without create access.
export { CollectionComposer } from "./components/CollectionComposer.jsx";
export { CollectionFieldsForm, seedValues, buildPayload, requiredMissing, humanizeCollectionError } from "./components/editors/CollectionFieldsForm.jsx";

export { useCollection, useCollectionItem } from "./hooks/use-collection.js";
// Escape hatch for markup that computes with a record instead of rendering one
// of its fields. Replaces what the removed render-prop used to hand over.
export { useCollectionRecord } from "./lib/collection-item-context.js";
export { useMyCollections } from "./hooks/use-my-collections.js";
// Powers <CollectionComposer> and the drawer's new-item card; exposed for
// hosts that want to build their own create UI over the same draft/submit flow.
export { useCollectionCreate } from "./hooks/use-collection-create.js";
