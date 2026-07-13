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
// Chrome-free "add one item" form the host mounts on its own page; renders
// nothing for visitors without create access.
export { CollectionComposer } from "./components/CollectionComposer.jsx";
export { CollectionFieldsForm, seedValues, buildPayload, requiredMissing, humanizeCollectionError } from "./components/editors/CollectionFieldsForm.jsx";

export { useCollection, useCollectionItem } from "./hooks/use-collection.js";
export { useMyCollections } from "./hooks/use-my-collections.js";
