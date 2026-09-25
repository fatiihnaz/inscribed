"use client";

/**
 * @file `<CollectionItem>`: one collection record, rendered by element children.
 *
 * Public visitors get the children as-is. Admins who can edit the record also get a
 * click-to-focus wrapper (like EditableRegion) that opens the matching drawer
 * card, plus publish/revert on the ring once the page carries fields.
 *
 *   <CollectionItem collection="news" slug="q1-release-notes">
 *     <article>
 *       <CollectionField name="title" as="h1" />
 *       <CollectionField name="body" as="div" html />
 *     </article>
 *   </CollectionItem>
 *
 * Children are elements, not a function, so the same markup works from a Server
 * Component: `createCmsPage` returns a server `<CollectionItem>` that awaits the
 * record and hands it to `<CollectionRecord>` below. Markup that has to compute
 * with the record (a link built from the slug) reads it through
 * `useCollectionRecord()` in a small client component of its own.
 *
 * The binding identifies itself by the record it points at, so rendering the
 * same item twice on a page yields one drawer card, not two.
 */

import { isValidElement, lazy, Suspense, useContext, useEffect, useId, useMemo } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { collectionItemBindingId, useCollectionContext } from "./context.js";
import { CollectionItemContext } from "./item-context.js";
import { CmsGroupContext, CmsGroupVisibilityContext } from "../shared/state/group-context.js";
import { useEditorVisibility } from "../core/hooks/use-editor-visibility.js";
import { useCollectionItem } from "./hooks/use-collection.js";
import { useStoreSelector } from "../shared/state/store.js";

// The editor engine, the ring and the publish controls. None of it can do
// anything for a visitor, and a public page listing records would otherwise
// carry the whole editing layer to render a headline.
const CollectionEditScope = lazy(() =>
  import("./CollectionEditScope.jsx").then((m) => ({ default: m.CollectionEditScope })),
);

/**
 * @import { CollectionItemResponse } from "../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {string} [group]
 * @property {string} [label]      Drawer card and page chip text (default: `"{collection} · {slug}"`).
 * @property {React.ReactNode} [fallback]
 *   Shown while the record loads. Client path only; the server one has awaited
 *   the record before rendering anything.
 * @property {React.ReactNode} [missing]
 *   Shown when the record does not exist (404). Defaults to nothing.
 * @property {React.ReactNode} [error]
 *   Shown when the read failed for any other reason, kept apart from `missing`
 *   so a broken backend doesn't read as "no such record". Defaults to `missing`.
 *   Retry needs a callback, which no longer crosses the children boundary: build
 *   one with `useCollectionItem` in your own client component.
 * @property {React.ReactNode} children
 */

/**
 * Client entry point: fetches the record, then hands it to `CollectionRecord`.
 *
 * @param {CollectionItemProps} props
 */
export function CollectionItem({
  collection, slug, group, label, fallback, missing, error: errorNode, children,
}) {
  // Raw, not draft-overlaid: the overlay would rebuild `item` on every
  // keystroke and carry that through the record's scope to every field, which
  // is exactly what field-level selection avoids. Fields read live values from
  // the editor (`useEditorField`) or the record (`useCollectionRecord`), both of
  // which subscribe to the draft themselves.
  const { item, isLoading, error } = useCollectionItem(collection, slug, {
    overlayDrafts: false,
  });

  if (isLoading) return fallback ?? null;
  if (error) {
    return /** @type {*} */ (error).isNotFound
      ? (missing ?? null)
      : (errorNode ?? missing ?? null);
  }
  if (!item) return missing ?? null;

  return (
    <CollectionRecord
      collection={collection}
      slug={slug}
      item={item}
      group={group}
      label={label}
    >
      {children}
    </CollectionRecord>
  );
}

/**
 * Everything about a record except fetching it: the drawer binding, the scope
 * `<CollectionField>` reads, and the admin editing chrome. Split out so both
 * entry points share it: the client one above, and the server one from
 * `createCmsPage`, which awaits `getCmsCollectionItem` and passes `item` down.
 *
 * @param {{
 *   collection: string,
 *   slug: string,
 *   item: CollectionItemResponse,
 *   group?: string,
 *   label?: string,
 *   children: React.ReactNode,
 * }} props
 */
export function CollectionRecord({ collection, slug, item, group, label, fromRegion, children }) {
  const { isAdmin, uiStore, setActiveBlock } = useCmsContext();
  const {
    registerCollectionBinding, unregisterCollectionBinding, collectionStore, requestCollectionItem,
  } = useCollectionContext();
  const groupPrefix = useContext(CmsGroupContext);
  // Distinguishes this element from any other bound to the same record, which
  // is how the provider elects one of them to drive the shared draft.
  const scopeId = useId();

  // What the caller asked for and what the record actually is can differ two
  // ways: slugs are lowercased server-side, and a renamed record still answers
  // to its old address. Everything downstream keys off this (cache, draft slot,
  // binding id, the drawer's card), so it has to be the record's own slug, or
  // one row ends up addressed two ways and the writes land on an alias.
  const recordSlug = item.slug ?? slug;
  const bindingId = collectionItemBindingId(collection, recordSlug);
  const cardGroup = group ?? groupPrefix;
  const cardLabel = label ?? `${collection} · ${recordSlug}`;

  // Case alone is normalisation, not an alias, so it warns about neither.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (recordSlug.toLowerCase() === slug.toLowerCase()) return;
    // Naming the redirect matters more than naming the binding: editing keeps
    // working either way, so the part that goes unnoticed is the old URL still
    // serving the page, splitting the record across two addresses.
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] <CollectionItem collection="${collection}" slug="${slug}"> points at an old ` +
        `address; the record now lives at "${recordSlug}". The binding follows the record, so ` +
        "editing is unaffected. But if this route is addressed by the slug, the old URL is still " +
        `serving the page: export CollectionItem.metadata("${collection}") as generateMetadata ` +
        "to settle it.",
    );
  }, [collection, slug, recordSlug]);

  // Hand the binding to the drawer for its Page-tab card. Public visitors
  // register too, keeping register/unregister symmetric across mode switches.
  useEffect(() => {
    /** @type {import("../shared/contracts/schemas.js").CollectionBinding} */
    const binding = { collection, slug: recordSlug, group: cardGroup, label: cardLabel };
    if (fromRegion) binding.fromRegion = fromRegion;
    registerCollectionBinding(bindingId, binding);
    return () => unregisterCollectionBinding(bindingId);
  }, [
    bindingId, collection, recordSlug, cardGroup, cardLabel, fromRegion,
    registerCollectionBinding, unregisterCollectionBinding,
  ]);

  // A record inside a hidden or locked `<CmsGroup>` follows the group, the same
  // way content blocks do. Registered under the binding id because that is what
  // the drawer files the synthesised Collection row under.
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  useEditorVisibility(bindingId, groupVisibility);

  // Whether this admin may edit the record, and whether they left a draft on it,
  // come from their own read: a server-rendered `item` was read with the service
  // key, which gets neither. The editor below works from the same cache entry,
  // so this costs no request of its own. Visitors never read.
  const cacheKey = `${collection}:${recordSlug}`;
  const adminItem = useStoreSelector(
    collectionStore,
    (st) => (isAdmin ? st.itemCache.get(cacheKey)?.item ?? null : null),
  );
  // Refills after `invalidateCollectionItem` drops the entry, as `useCollectionItem` does.
  const hasEntry = useStoreSelector(collectionStore, (st) => st.itemCache.has(cacheKey));
  useEffect(() => {
    if (isAdmin) requestCollectionItem(collection, recordSlug);
  }, [isAdmin, collection, recordSlug, hasEntry, requestCollectionItem]);

  // Booleans, not the maps: editing another record leaves this binding alone.
  const hasDraft = useStoreSelector(collectionStore, (st) => st.drafts.has(cacheKey));
  const isActive = useStoreSelector(uiStore, (s) => s.activeBlock === bindingId);

  // Readers still get a scope: `<CollectionField>` renders the value for them,
  // it just has no editor behind it.
  const readScope = useMemo(
    () => ({ collection, slug: recordSlug, scopeId, item, editor: null }),
    [collection, recordSlug, scopeId, item],
  );

  const readOnly = (
    <CollectionItemContext.Provider value={readScope}>
      {children}
    </CollectionItemContext.Provider>
  );

  if (!isAdmin || !adminItem?.canEdit || groupVisibility) return readOnly;

  return (
    // The published record is the fallback, so the page reads correctly from
    // the first frame and the editing affordances arrive with the chunk.
    <Suspense fallback={readOnly}>
    <CollectionEditScope
      collection={collection}
      slug={recordSlug}
      scopeId={scopeId}
      item={item}
      bindingId={bindingId}
      label={cardLabel}
      tag={elementTag(children)}
      dirty={hasDraft || adminItem.draftData != null}
      isActive={isActive}
      setActiveBlock={setActiveBlock}
    >
      {children}
    </CollectionEditScope>
    </Suspense>
  );
}

/**
 * The wrapper's display mode follows the children's own element, so a record
 * around a `<div>` gets the padded card and one inside a sentence stays tight.
 * Only a single element can answer; anything else falls back to inline.
 *
 * @param {React.ReactNode} children
 * @returns {string | null}
 */
function elementTag(children) {
  return isValidElement(children) && typeof children.type === "string"
    ? children.type
    : null;
}
