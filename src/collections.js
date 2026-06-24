"use client";

/**
 * @file Public client-side API for the optional Collections capability,
 * exposed as the `inscribed/collections` subpath.
 *
 * Collections are a separate namespace from the CMS block editor (their own
 * provider, context, cache, and API). Importing them from this subpath keeps
 * them out of an app's graph when unused, and makes the dependency explicit.
 *
 * Mounting: `<CollectionProvider>` must live inside `<CmsProvider>` (it reads
 * `config` / `isAdmin` / `getAccessToken` from the CMS context). Today
 * `<CmsProvider>` mounts it for you automatically, so apps that only use the
 * components/hooks below don't need to render it themselves.
 *
 * The `"use client"` directive above is load-bearing: tsup/esbuild bundles
 * every transitive `.jsx` into `dist/collections.js` and drops inner-file
 * directives during bundling. Only this entry file's top-level directive is
 * preserved, so Next.js needs it here to treat the bundle as a Client
 * Component (these are all hooks / context consumers).
 */

export { CollectionProvider } from "./components/CollectionProvider.jsx";
export { CollectionRegion } from "./components/CollectionRegion.jsx";
export { CollectionItem } from "./components/CollectionItem.jsx";
export { CollectionFieldsForm, seedValues, buildPayload, requiredMissing, humanizeCollectionError } from "./components/editors/CollectionFieldsForm.jsx";

export { useCollection, useCollectionItem } from "./hooks/use-collection.js";
export { useMyCollections } from "./hooks/use-my-collections.js";
