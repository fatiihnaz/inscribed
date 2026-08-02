"use client";

/**
 * @file Who is allowed to write a record's draft. One record can be open on two
 * surfaces at once (the page's `<CollectionField>`s and a drawer card), and they
 * share one draft slot, so exactly one of them may run the autosave.
 *
 * The rule used to be spelled out at each call site, and one of them forgot it,
 * leaving two surfaces PUTting the same slot. It lives here now so a new surface
 * cannot opt out by accident.
 */

import { useEffect } from "react";

import { useCollectionContext } from "../context.js";
import { useStoreSelector } from "../../shared/state/store.js";

/**
 * @typedef {Object} DraftRole
 * @property {boolean} active
 *   Owns the network: only this surface runs the debounced write, and it sends
 *   whatever the shared draft holds, whoever typed it.
 * @property {boolean} mirror
 *   Keeps in step with the draft: re-seeds as another surface types, and its own
 *   edits go into the draft for the others to see. A surface nobody is looking
 *   at passes `false` and stops re-seeding on every keystroke.
 */

/**
 * Role for a page-side `<CollectionItem>` scope.
 *
 * Page fields win while they exist: they are what the user is typing into. The
 * elected driver is the first scope to claim the record, so a record rendered
 * twice on one page still has a single writer.
 *
 * @param {string} collection
 * @param {string} slug
 * @param {string} scopeId  This scope's `useId()`, the election token.
 * @returns {DraftRole}
 */
export function useRecordDraftRole(collection, slug, scopeId) {
  const { collectionStore } = useCollectionContext();
  // This record's driver only: a field claiming some other record must not
  // re-render this scope.
  const driver = useStoreSelector(
    collectionStore,
    (s) => s.inlineFields.get(`${collection}:${slug}`),
  );
  return { active: driver === scopeId, mirror: driver !== undefined };
}

/**
 * Role for a drawer surface (the Page-tab card, the Collections rail's detail
 * pane). It stands down whenever the page carries fields for the record.
 *
 * @param {string} collection
 * @param {string} slug
 * @param {boolean} [visible]
 *   Whether this surface is on screen. A collapsed card behind a shut panel
 *   passes `false` and stops mirroring until it comes back into view.
 * @returns {DraftRole}
 */
export function useDrawerDraftRole(collection, slug, visible = true) {
  const { collectionStore } = useCollectionContext();
  const pageOwnsDraft = useStoreSelector(
    collectionStore,
    (s) => s.inlineFields.has(`${collection}:${slug}`),
  );
  return { active: !pageOwnsDraft, mirror: visible };
}

/**
 * Role for a new-item composer. A collection has one new-item slot, so two
 * composers for the same key (the page's `<CollectionComposer>` and the
 * drawer's create lane) would otherwise both write it. There is no scope
 * registry for this path, so the first mount claims the lane and later ones
 * stay passive until it unmounts.
 *
 * @param {string} collection
 * @param {string} scopeId
 * @param {boolean} [enabled]  Callers that are conditionally inert (a collapsed
 *   create card) pass `false` and never claim the lane.
 * @returns {boolean} whether this composer may write.
 */
export function useCreateDraftRole(collection, scopeId, enabled = true) {
  const { collectionStore, claimCreateLane, releaseCreateLane } = useCollectionContext();

  useEffect(() => {
    if (!enabled) return undefined;
    claimCreateLane(collection, scopeId);
    return () => releaseCreateLane(collection, scopeId);
  }, [collection, scopeId, enabled, claimCreateLane, releaseCreateLane]);

  const owner = useStoreSelector(collectionStore, (s) => s.createLanes.get(collection));
  return enabled && owner === scopeId;
}
