"use client";

/**
 * @file Public API for writing a collection's records from your own page,
 * exposed as the `inscribed/compose` subpath. `inscribed/collections` is the
 * reading half; this is the writing one.
 *
 * Its own subpath rather than part of that barrel, for the reason
 * `inscribed/panels` has one: nothing here is of use to a page that only
 * *renders* records, and a barrel export cannot be shaken out of a page that
 * imports its neighbour. Every export below reaches the field editors, and
 * through them the panel's string catalogs, the icon set and the editor
 * stylesheet. On the collections entry that weight rode along with a read-only
 * news list; on its own it is downloaded by the pages that actually author.
 *
 * `<CollectionComposer>` is the ready-made form. The rest is what it is built
 * from, for a host that wants its own markup: `<CollectionFieldsForm>` renders
 * a schema, `useCollectionCreate` drives the draft and submit flow, and the
 * three payload helpers plus the error humaniser are the pure parts between
 * them. A collection holding several languages swaps the first two for
 * `useMultilingualCreate`, `<LanguageChips>` and `<MultilingualFields>`.
 *
 * The top-level `"use client"` is load-bearing, same as in `index.js`: tsup
 * keeps only the entry file's directive.
 */

// Chrome-free "add one item" form the host mounts on its own page; renders
// nothing for visitors without create access.
export { CollectionComposer } from "./collections/CollectionComposer.jsx";
export { CollectionFieldsForm } from "./collections/CollectionFieldsForm.jsx";
// Powers <CollectionComposer> and the drawer's new-item card; exposed for
// hosts that want to build their own create UI over the same draft/submit flow.
export { useCollectionCreate } from "./collections/hooks/use-collection-create.js";
export { useMultilingualCreate } from "./collections/hooks/use-multilingual-create.js";
export { LanguageChips } from "./collections/LanguageChips.jsx";
export { MultilingualFields } from "./collections/MultilingualFields.jsx";
// A collection has one new-item draft slot; a host composer passes this as the
// create hook's `active`, or it and the drawer's create lane both write it.
export { useCreateDraftRole } from "./collections/hooks/use-draft-driver.js";
export { seedValues, buildPayload, requiredMissing } from "./collections/record-payload.js";
export { humanizeCollectionError } from "./collections/record-errors.js";
