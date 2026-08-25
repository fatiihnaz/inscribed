"use client";

/**
 * @file `useCollectionEditor`: the headless state machine behind editing one
 * collection record. Seeds from the schema, mirrors the shared draft,
 * debounces the autosave PUT, publishes on save. No chrome of its own, so the
 * drawer's form and the page-side `<CollectionField>` drive the same state.
 *
 * `useEditorValues` / `useEditorField` read a surface's working copy back out
 * of the collection store. Two reads on purpose: the drawer's form renders
 * every field and wants the whole object, while a page-side field wants only
 * its own key so a keystroke elsewhere doesn't re-render it.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { useCollectionContext } from "../context.js";
import { useStoreSelector } from "../../shared/state/store.js";
import { useCollectionItem } from "./use-collection.js";
import { useCollectionLocale } from "./use-collection-locale.js";
import { useCollectionMeta, useMyCollections } from "./use-my-collections.js";
import { itemDraftKey } from "../../shared/state/draft-keys.js";
import { CmsApiError } from "../../shared/contracts/errors.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";
import { seedValues, buildPayload, requiredMissing } from "../record-payload.js";
import { humanizeCollectionError } from "../record-errors.js";

/**
 * Whether a read came back as a claim-derived slug with no record behind it
 * yet. `origin` is the tell: the backend puts it on virtual bodies only, and a
 * persisted item never carries it.
 *
 * Every surface mounting this hook addresses a slug, so the virtual body here
 * is always `origin: "derived"`. The collection's slug-less pending draft has
 * no slug to be opened at, and belongs to `useCollectionCreate` instead.
 *
 * @param {*} item
 * @returns {boolean}
 */
function isVirtualItem(item) {
  return item != null && "origin" in item;
}

/**
 * @typedef {Object} CollectionEditorState
 * @property {import("../../shared/contracts/schemas.js").CollectionSchema | null} schema
 * @property {string | null} slugSource
 * @property {import("../../shared/contracts/schemas.js").CollectionItemResponse | null} item
 * @property {string} editorId
 *   Where this surface's form values sit in `collectionStore.editorValues`.
 *   Handed out rather than the values themselves so a keystroke re-renders the
 *   fields reading it, not everything holding the editor object. Read it with
 *   `useEditorValues` (whole form) or `useEditorField` (one field).
 * @property {() => Record<string, *> | null} readValues
 *   The current values without subscribing, for handlers that patch one key.
 * @property {(next: Record<string, *>) => void} setValues
 * @property {() => void} save
 * @property {() => void} undoDraft
 * @property {() => void} archive
 *   Take the record out of every default view, keeping its slug and content.
 *   No-op while the row is virtual or already archived.
 * @property {() => void} restore
 * @property {(nextSlug: string, options?: { replaceAlias?: boolean }) => void} rename
 *   Move the record to another slug, leaving the old one behind as an alias.
 *   No-op unless `canRename`, and refuses a rename while the row is dirty: the
 *   call bumps the version, so a draft autosave still holding the old one would
 *   start answering 409 the moment it lands.
 * @property {boolean} canRename
 * @property {{ slug: string, conflictingSlug: string | null } | null} renameConflict
 *   Set when a rename was refused because the target is another record's old
 *   address. The way past it is `rename(slug, { replaceAlias: true })`, but only
 *   once the user has agreed to break that record's inbound links, so this is
 *   surfaced as a question rather than retried automatically.
 * @property {() => void} dismissRenameConflict
 * @property {boolean} hasDraft
 * @property {boolean} canEdit
 * @property {boolean} isArchived
 * @property {boolean} isVirtual
 * @property {boolean} isPending
 * @property {string | null} error
 * @property {"idle"|"saving"|"failed"} draftStatus
 * @property {string | null} lastDraftSavedAt
 * @property {boolean} publishedFlash  Transient signal: true for ~2.4s
 *   after a successful `save()` so the indicator can echo "Veri kaydedildi"
 *   before settling back to its idle dot. Cleared early if the user
 *   resumes editing (next autosave start).
 * @property {boolean} meLoading
 * @property {Error | null} meError
 * @property {boolean} itemLoading
 * @property {Error | null} itemError
 * @property {() => Promise<void>} refetch
 * @property {string} collection
 * @property {string} slug
 */

/**
 * State + handlers for a single collection row editor. Lifted out of the
 * component so the surrounding card can render header-level controls
 * (e.g. the "Geri al" reset button) that drive the same state as the
 * inline form below.
 *
 * @param {string} collection
 * @param {string} slug
 * @param {{ active?: boolean, mirror?: boolean }} [options]
 *   One record can be open in two places at once (the page's
 *   `<CollectionField>`s and this card), and they share one draft, so the two
 *   flags split what each surface is allowed to do with it:
 *
 *   - `active` owns the network: only this surface runs the debounced PUT, and
 *     it sends whatever the shared draft holds, whoever typed it. Two surfaces
 *     PUTting one draft slot race, so exactly one may be active.
 *   - `mirror` keeps the surface in step with the draft: it re-seeds as the
 *     other surface types, and its own edits go into the draft for them to see.
 *     A surface nobody is looking at (a collapsed card, a hidden drawer) passes
 *     `false` and stops re-seeding on every keystroke.
 *
 *   A surface that is neither reads the record once and leaves the draft alone.
 *
 *   `onRenamed` is called with the record's new slug whenever this surface's
 *   address stops being current: a rename it performed itself, or one someone
 *   else performed, which any write here discovers as `reason: "moved"`. The
 *   hook addresses the record by the `slug` it was given, so a surface holding
 *   that slug in its own state has to move; nothing here can do it for them.
 * @returns {CollectionEditorState}
 */
export function useCollectionEditor(
  collection,
  slug,
  { active = true, mirror = true, scopeId, onRenamed } = {},
) {
  const { config, getAccessToken, onAfterCollectionSave } = useCmsContext();
  const t = useCmsStrings();
  // Only the create branch of `save` needs this: a published record is
  // addressed by a slug that is already unique across every language.
  const locale = useCollectionLocale(collection);
  const {
    collectionStore,
    draftQueue,
    updateCollectionItem,
    patchCollectionItem,
    invalidateCollectionItem,
    invalidateCollectionList,
    setCollectionDraft,
    clearCollectionDraft,
    setCollectionDraftSavedAt,
    setEditorValues,
    clearEditorValues,
  } = useCollectionContext();
  // Form state lives in the store under this surface's own id, so a keystroke
  // re-renders the fields that read it rather than everything holding the
  // record's scope. Per surface, not per record: two surfaces editing one
  // record keep separate working copies and meet at the shared draft below.
  const ownId = useId();
  const editorId = scopeId ?? ownId;
  useEffect(() => () => clearEditorValues(editorId), [editorId, clearEditorValues]);
  const { isLoading: meLoading, error: meError } = useMyCollections();
  // Read the raw item (overlayDrafts: false): consuming our own overlay would
  // re-fire the seeding effect every keystroke and stall the autosave debounce.
  const { item, isLoading: itemLoading, error: itemError, refetch } = useCollectionItem(
    collection,
    slug,
    { overlayDrafts: false },
  );

  const meta = useCollectionMeta(collection);
  const schema = meta?.schema ?? null;
  const slugSource = meta?.slugSource ?? null;

  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [renameConflict, setRenameConflict] = useState(
    /** @type {{ slug: string, conflictingSlug: string | null } | null} */ (null),
  );
  const [isPending, startTransition] = useTransition();
  const [draftStatus, setDraftStatus] = useState(
    /** @type {"idle"|"saving"|"failed"} */ ("idle"),
  );
  // Post-publish pulse driven by `save()`: a green "Veri kaydedildi" chip for a
  // couple of seconds. Distinct from `lastDraftSavedAt`, which tracks the draft slot.
  const [publishedFlash, setPublishedFlash] = useState(false);
  useEffect(() => {
    if (!publishedFlash) return undefined;
    const t = setTimeout(() => setPublishedFlash(false), 2400);
    return () => clearTimeout(t);
  }, [publishedFlash]);

  // Last payload the server returned or we PUT as a draft. Guards against
  // resending an unchanged payload and against re-seeding over live keystrokes.
  const lastSyncedRef = useRef(/** @type {string | null} */ (null));
  const failedResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  // Whether this record's autosave already answered a 409 with a refetch.
  const conflictRetriedRef = useRef(false);
  // Read inside the edit handler so it keeps one identity: the item moves on
  // every cache write (roughly once per autosave), and re-binding the handler
  // that often would churn the record scope the fields hang off.
  const itemRef = useRef(item);
  itemRef.current = item;
  // Same reason as `itemRef`: the host passes this inline, and depending on it
  // directly would re-bind `rename` on every render of the surface.
  const onRenamedRef = useRef(onRenamed);
  onRenamedRef.current = onRenamed;

  /**
   * The shared draft: what any surface editing this record has typed but not
   * published. Both the overlay `<CollectionItem>` renders and the value the
   * autosave PUTs come from here.
   */
  const localDraft = useStoreSelector(
    collectionStore,
    (s) => s.drafts.get(`${collection}:${slug}`),
  );

  // HH:MM of the last successful autosave. Shared rather than per-surface: only
  // the driver runs the PUT, so a local copy would leave every other surface
  // showing nothing for a draft that plainly saved.
  const lastDraftSavedAt = useStoreSelector(
    collectionStore,
    (s) => s.draftSavedAt.get(`${collection}:${slug}`) ?? null,
  );

  /** This surface's working copy, read without subscribing (see `editorId`). */
  const readValues = useCallback(
    () => collectionStore.get().editorValues.get(editorId) ?? null,
    [collectionStore, editorId],
  );

  // What a publish would have to change. Compared against, rather than
  // `lastSyncedRef`: that one tracks the last payload the server took, so once
  // an autosave lands it no longer answers "is this the published value".
  const publishedPayload = useMemo(
    () => (schema
      ? stableStringify(buildPayload(schema.fields, seedValues(schema.fields, item?.data ?? {})))
      : null),
    [schema, item?.data],
  );

  /**
   * Stand the record's draft down, locally and on the server. Cleanup is a
   * DELETE, not an echo-PUT of the published payload: an echo can lose a race
   * with a concurrent publish and recreate a draft instead of clearing one.
   */
  const dropDraft = useCallback(() => {
    clearCollectionDraft(collection, slug);
    const current = itemRef.current;
    if (!current || current.draftData == null) return;
    // In-place patch, so list windows don't refetch the server's still-dirty
    // state before the DELETE lands.
    patchCollectionItem(collection, slug, { ...current, draftData: null });
    // Cancel first, then queue: an autosave already in flight must land before
    // the DELETE, or it would undo the cleanup it overtook.
    const queueKey = itemDraftKey(collection, slug);
    draftQueue.cancel(queueKey);
    draftQueue.enqueue(queueKey, async () => {
      try {
        const token = await getAccessToken();
        await config.transport.deleteCollectionItemDraft(collection, slug, { accessToken: token });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection draft cleanup failed:", err);
      }
    });
  }, [
    collection, slug, clearCollectionDraft, patchCollectionItem, draftQueue,
    getAccessToken, config,
  ]);

  /**
   * Move this surface's state to the address the record actually lives at, after
   * a write came back `reason: "moved"`.
   *
   * Whatever the user has typed rides along in the shared draft instead of being
   * thrown away. That is the whole point of being refused rather than silently
   * redirected: the write did not happen, so the text is still unsaved, and it
   * has somewhere valid to go.
   *
   * The record itself is re-read rather than carried over, because a `moved`
   * response names an address and nothing else, and a caller this far behind has
   * no claim about what is at that address now.
   *
   * @param {string} canonicalSlug
   */
  const repointToCanonical = useCallback((canonicalSlug) => {
    if (!canonicalSlug || canonicalSlug === slug) return;
    const carried = collectionStore.get().drafts.get(`${collection}:${slug}`);
    // Anything still scheduled here is aimed at an address that no longer
    // accepts writes.
    const staleKey = itemDraftKey(collection, slug);
    draftQueue.cancel(staleKey);
    // Clear the slot we are walking away from. Deleting a draft is the one call
    // the old address still answers, precisely so a repointing client can tidy
    // up after itself; skip it and this user's half-written text sits at a slug
    // nothing reads until its TTL runs out. Safe because the text is not being
    // discarded: it rides along below and autosaves again at the new address.
    draftQueue.enqueue(staleKey, async () => {
      try {
        const token = await getAccessToken();
        await config.transport.deleteCollectionItemDraft(collection, slug, { accessToken: token });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] orphaned collection draft cleanup failed:", err);
      }
    });
    setCollectionDraftSavedAt(collection, slug, null);
    clearCollectionDraft(collection, slug);
    invalidateCollectionItem(collection, slug);
    if (carried !== undefined) setCollectionDraft(collection, canonicalSlug, carried);
    // Both ends are stale: this tab is behind by at least the write that moved
    // the row, and every window still lists it under the address it left.
    invalidateCollectionItem(collection, canonicalSlug);
    invalidateCollectionList(collection);
    // The same seam a rename we performed ourselves reports through. A page-side
    // record needs no host help: its binding follows `item.slug`, so the re-read
    // above is what rebinds it.
    onRenamedRef.current?.(canonicalSlug);
  }, [
    collection, slug, collectionStore, draftQueue, getAccessToken, config,
    setCollectionDraftSavedAt, clearCollectionDraft, setCollectionDraft,
    invalidateCollectionItem, invalidateCollectionList,
  ]);

  // A user edit and its handoff to the shared draft happen together, rather
  // than the edit landing and an effect noticing it a render later. The draft
  // is what every other surface renders, so the two must not drift apart.
  const setValuesFromUser = useCallback(
    /** @param {Record<string, *>} next */
    (next) => {
      setEditorValues(editorId, next);
      if (!active && !mirror) return;
      if (!schema || !itemRef.current?.canEdit) return;
      const payload = buildPayload(schema.fields, next);
      // Edited back to what is published: there is nothing left to publish, so
      // the draft goes rather than lingering as an identical copy.
      if (stableStringify(payload) === publishedPayload) {
        dropDraft();
      } else {
        setCollectionDraft(collection, slug, payload);
      }
    },
    [
      editorId, setEditorValues, active, mirror, schema, collection, slug,
      setCollectionDraft, publishedPayload, dropDraft,
    ],
  );

  // Seed form state once schema + item arrive. Precedence: the shared draft (a
  // sibling surface may be mid-edit), then the server draft, then published
  // data, so in-flight edits survive both a reload and a second editor.
  useEffect(() => {
    if (!schema) return;
    const fromDraft = mirror && localDraft !== undefined;
    const baseline = fromDraft ? localDraft : (item?.draftData ?? item?.data ?? {});
    const seeded = seedValues(schema.fields, baseline);
    // Normalise through the same seed->buildPayload pipeline the autosave
    // compares against; storing the raw baseline would leave `lastSyncedRef` out
    // of step (readOnly strip, default-fill, Number->null) and the first
    // autosave would PUT a phantom diff.
    const serialized = stableStringify(buildPayload(schema.fields, seeded));
    // Already holding this, typically our own draft write coming back around.
    // Re-seeding here would restart the debounce we just started. This is the
    // only skip: matching `lastSyncedRef` must *not* be one, or a revert back
    // to the published value would never reach a surface that never PUT it
    // (its `lastSyncedRef` still holds exactly that value).
    const current = readValues();
    if (current && serialized === stableStringify(buildPayload(schema.fields, current))) return;
    setEditorValues(editorId, seeded);
    // Only the server's view counts as synced. Claiming a sibling's unsent
    // draft here would make the next autosave pass clear it instead of PUT it.
    if (!fromDraft) lastSyncedRef.current = serialized;
  }, [schema, item, localDraft, mirror, readValues, setEditorValues, editorId]);

  useEffect(() => () => {
    if (failedResetRef.current) clearTimeout(failedResetRef.current);
  }, []);

  // Clear the timestamp when the server draft goes away (publish/undo drop
  // `draftData`), so it doesn't point at a draft that no longer exists.
  useEffect(() => {
    if (item?.draftData == null) setCollectionDraftSavedAt(collection, slug, null);
  }, [item?.draftData, collection, slug, setCollectionDraftSavedAt]);

  // Debounced draft autosave (1s after the last change), PUT to the item-draft
  // endpoint. Reads the shared draft rather than local `values`, so the driver
  // sends an edit whichever surface typed it. Write-only: a publish auto-clears
  // the slot and the seeding effect resyncs `lastSyncedRef`, preventing a loop
  // against the just-saved value.
  //
  // One endpoint for both real and derived rows: a derived slug has its own
  // draft slot keyed by that slug, and the collection's slug-less pending slot
  // is the composer's alone. Routing a derived row there instead wrote into a
  // slot nothing ever read back, and now answers 400.
  useEffect(() => {
    if (!active) return undefined;
    if (!schema || !item?.canEdit) return undefined;
    if (isPending) return undefined;
    if (localDraft === undefined) return undefined;

    const payload = localDraft;
    const serialized = stableStringify(payload);
    if (serialized === lastSyncedRef.current) return undefined;

    const queueKey = itemDraftKey(collection, slug);

    // No cleanup that cancels: re-scheduling the same key already replaces the
    // pending write, and a draft the user typed should still reach the server
    // when the surface showing it unmounts.
    draftQueue.schedule(queueKey, async (ctx) => {
      try {
        const token = await getAccessToken();
        setDraftStatus("saving");
        // Editing resumed, so the "Veri kaydedildi" flash no longer holds.
        setPublishedFlash(false);
        await config.transport.saveCollectionItemDraft(collection, slug, { data: payload }, { accessToken: token });
        // An undo landed while this was in flight: it already cleared the
        // draft, so writing our sent value back would re-create it.
        if (ctx.isStale()) return;
        lastSyncedRef.current = serialized;
        conflictRetriedRef.current = false;
        // Patch the cache so `hasDraft` flips immediately. In-place so list
        // windows don't refetch and overwrite it with the pre-cleanup state.
        if (item) {
          patchCollectionItem(collection, slug, { ...item, draftData: payload });
        }
        setDraftStatus("idle");
        setCollectionDraftSavedAt(collection, slug, formatClock(new Date()));
      } catch (err) {
        if (ctx.isStale()) return;
        // The one write that can carry straight over: a draft has no version to
        // clash on and it is this user's own text, so repointing is enough and
        // the effect re-schedules it at the new address on the next render.
        if (err instanceof CmsApiError && err.isMovedConflict && err.conflictingSlug) {
          repointToCanonical(err.conflictingSlug);
          setDraftStatus("idle");
          return;
        }
        // Same reasoning as the block lane: a conflict means the row moved
        // under this draft, not that the draft is worthless. Refetch and let
        // the effect re-schedule itself, since it depends on `item` and
        // `lastSyncedRef` still holds the pre-write value. Once only, or a row
        // that keeps clashing would refetch on a loop.
        if (err instanceof CmsApiError && err.isConflict && !conflictRetriedRef.current) {
          conflictRetriedRef.current = true;
          await refetch();
          setDraftStatus("idle");
          return;
        }
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection draft autosave failed:", err);
        setDraftStatus("failed");
        if (failedResetRef.current) clearTimeout(failedResetRef.current);
        failedResetRef.current = setTimeout(() => {
          setDraftStatus("idle");
          failedResetRef.current = null;
        }, 4000);
      }
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, localDraft, item, schema, slug, collection, isPending, repointToCanonical]);

  // A slug the user owns but has never saved reads as virtual until the first
  // publish; a missing read (404, or still in flight) is not the same thing,
  // but it has no version to send either, so both take the create branch.
  const isVirtual = !item || isVirtualItem(item);
  const canEdit = item?.canEdit ?? false;
  const hasDraft = item?.draftData != null;
  // Absent means live: the backend sends the flag only on an archived row.
  const isArchived = item?.isArchived === true;

  const save = useCallback(() => {
    setError(null);
    const values = readValues();
    if (!schema || !values) return;
    const missing = requiredMissing(schema.fields, values);
    if (missing) {
      setError(t("collections.requiredMissing", { field: missing }));
      return;
    }
    const queueKey = itemDraftKey(collection, slug);
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        const saved = await config.transport.upsertCollectionItem(
          collection,
          slug,
          {
            data: buildPayload(schema.fields, values),
            // Absent on a virtual body, and the create branch does not read the
            // field at all: there is no row yet for a version to disagree with.
            version: itemRef.current?.version ?? null,
          },
          // Only the `version: null` create branch reads this: a virtual row
          // becoming real has no language yet, and it should be the one the
          // editor is composing in, not the collection's default.
          { accessToken: token, locale: locale ?? undefined },
        );
        // Push freshly-saved item into the provider cache: all
        // subscribers (this editor, the page-side <CollectionItem>,
        // any open Region tab) re-render without an extra GET. Force
        // `draftData: null` since the backend cleared the draft and the
        // upsert response may omit the field entirely.
        updateCollectionItem(collection, slug, { ...saved, draftData: null });
        // Drop the live-preview overlay so consumers fall back to the
        // freshly-published `item.data` immediately.
        clearCollectionDraft(collection, slug);
        // Stand the record's draft lane down, same shape as `undoDraft` below.
        // Cancel is for the write in flight: it would otherwise patch
        // `draftData` back on when it lands. The DELETE is for that same write's
        // other half, since cancelling can't recall a sent request and it
        // reaches the backend after the publish cleared the slot. The chain
        // orders them: this runs only once that write's response is back.
        draftQueue.cancel(queueKey);
        draftQueue.enqueue(queueKey, async () => {
          try {
            const token = await getAccessToken();
            await config.transport.deleteCollectionItemDraft(collection, slug, { accessToken: token });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] post-publish collection draft cleanup failed:", err);
          }
        });
        // Indicator flashes "Veri kaydedildi" for a beat before the row
        // settles into its idle dot.
        setPublishedFlash(true);
        // Drop the ISR cache: server-rendered pages hold the pre-publish row
        // until its tags are invalidated. The record's own tag and the
        // collection's both go, since a write can move it between windows.
        try {
          await onAfterCollectionSave(collection, saved.slug ?? slug);
        } catch (revalidateErr) {
          // eslint-disable-next-line no-console
          console.warn("[inscribed] onAfterCollectionSave failed:", revalidateErr);
        }
      } catch (err) {
        // Checked before the plain conflict: an archived row is not a race, and
        // "the list has been refreshed, try again" would send the user round a
        // loop that cannot end until someone restores it.
        if (err instanceof CmsApiError && err.isArchivedConflict) {
          setError(t("collections.archivedConflict"));
          await refetch();
        } else if (err instanceof CmsApiError && err.isMovedConflict && err.conflictingSlug) {
          // Repointed but deliberately not re-sent: this tab's version is as
          // stale as its slug, so replaying the payload at the new address could
          // overwrite whatever landed there. The user gets the current record
          // and their own edits side by side, and decides.
          repointToCanonical(err.conflictingSlug);
          setError(t("collections.recordMoved", { slug: err.conflictingSlug }));
        } else if (err instanceof CmsApiError && err.isConflict) {
          setError(t("collections.versionConflict"));
          await refetch();
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError(t("collections.editForbidden"));
        } else if (err instanceof CmsApiError && err.status === 400) {
          // Map the backend's `works[0].title` path notation onto schema
          // labels so the banner reads "Çalışmalar #1 → Başlık".
          setError(
            humanizeCollectionError(err.detail, schema.fields, t)
            ?? t("collections.invalidData", { detail: err.message }),
          );
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  }, [
    schema, collection, slug, locale, readValues, getAccessToken, config, draftQueue,
    updateCollectionItem, clearCollectionDraft, onAfterCollectionSave, refetch,
    repointToCanonical, t,
  ]);

  const undoDraft = useCallback(() => {
    setError(null);
    dropDraft();
  }, [dropDraft]);

  // Archive and restore share a shape: both move the row between views without
  // touching its content, both answer with the row's own version, and both make
  // a list window's membership wrong, so each ends by invalidating the item and
  // re-reading it. Neither is a draft operation, so the draft lane is left
  // alone: archiving drops the record's draft server-side anyway.
  const archive = useCallback(() => {
    const current = itemRef.current;
    if (!current || isVirtualItem(current) || current.isArchived) return;
    // The version rides in the query string, so a row without one would send
    // `?version=undefined` and get a 400 back instead of doing nothing.
    const version = current.version;
    if (typeof version !== "number") return;
    setError(null);
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        await config.transport.archiveCollectionItem(
          collection, slug, version, { accessToken: token },
        );
        // Every window for this collection loses a row, so entries go rather
        // than get patched: membership, not content, is what changed.
        invalidateCollectionList(collection);
        await refetch();
        await onAfterCollectionSave(collection, slug);
      } catch (err) {
        if (err instanceof CmsApiError && err.isArchivedConflict) {
          // Someone archived it first; the end state is the one we wanted.
          await refetch();
        } else if (err instanceof CmsApiError && err.isMovedConflict && err.conflictingSlug) {
          repointToCanonical(err.conflictingSlug);
          setError(t("collections.recordMoved", { slug: err.conflictingSlug }));
        } else if (err instanceof CmsApiError && err.isConflict) {
          setError(t("collections.versionConflict"));
          await refetch();
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError(t("collections.editForbidden"));
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  }, [
    collection, slug, getAccessToken, config, invalidateCollectionList,
    refetch, onAfterCollectionSave, repointToCanonical, t,
  ]);

  const restore = useCallback(() => {
    const current = itemRef.current;
    if (!current || isVirtualItem(current) || !current.isArchived) return;
    setError(null);
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        const restored = await config.transport.restoreCollectionItem(
          collection, slug, { accessToken: token },
        );
        updateCollectionItem(collection, slug, restored);
        await onAfterCollectionSave(collection, slug);
      } catch (err) {
        if (err instanceof CmsApiError && err.isMovedConflict && err.conflictingSlug) {
          repointToCanonical(err.conflictingSlug);
          setError(t("collections.recordMoved", { slug: err.conflictingSlug }));
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError(t("collections.editForbidden"));
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  }, [
    collection, slug, getAccessToken, config, updateCollectionItem,
    onAfterCollectionSave, repointToCanonical, t,
  ]);

  // Three independent "can this happen at all" answers, none of which may be
  // assumed from the others: the transport has to implement the call, the
  // collection has to allow renames (`slugEditable`), and this user has to own
  // this row (`canEdit`). A missing flag or a missing method both read as no,
  // so an older backend or a hand-written transport simply shows no affordance
  // rather than failing once someone presses it.
  const canRename = typeof config.transport.renameCollectionItem === "function"
    && meta?.slugEditable === true
    && canEdit && !isVirtual && !isArchived;

  const dismissRenameConflict = useCallback(() => setRenameConflict(null), []);

  /**
   * Rename is not a draft operation and not a content write, but it consumes a
   * version like both: the row comes back one higher, which is why a dirty row
   * is refused rather than renamed. An autosave still holding the old version
   * would answer 409 from here on, and the draft slot is addressed by slug, so
   * the write in flight would be aimed at an address that just became an alias.
   */
  const rename = useCallback(
    /** @param {string} nextSlug @param {{ replaceAlias?: boolean }} [options] */
    (nextSlug, { replaceAlias = false } = {}) => {
      // No-op rather than throw, like every other guard here: a transport that
      // can't rename is the same non-event as a row that has nothing to rename.
      if (typeof config.transport.renameCollectionItem !== "function") return;
      const current = itemRef.current;
      if (!current || isVirtualItem(current) || current.isArchived) return;
      const version = current.version;
      if (typeof version !== "number") return;
      const target = nextSlug.trim();
      if (!target || target === slug) return;
      if (
        collectionStore.get().drafts.has(`${collection}:${slug}`)
        || current.draftData != null
      ) {
        setError(t("collections.renameDirty"));
        return;
      }
      setError(null);
      setRenameConflict(null);
      startTransition(async () => {
        try {
          const token = await getAccessToken();
          const renamed = await config.transport.renameCollectionItem(
            collection,
            slug,
            { slug: target, version },
            { accessToken: token, replaceAlias },
          );
          // Nothing may write to the old address again: a lane still holding a
          // scheduled draft would PUT to what is now an alias.
          draftQueue.cancel(itemDraftKey(collection, slug));
          setCollectionDraftSavedAt(collection, slug, null);
          clearCollectionDraft(collection, slug);
          // The old entry has to go rather than linger: it is keyed by a slug
          // that now resolves to this same record, so leaving it would let two
          // cache entries claim one row.
          invalidateCollectionItem(collection, slug);
          // Seeds the new address and drops every list window for the
          // collection, which is what a slug change needs: the default sort is
          // `slug:asc`, so the row moves and page boundaries shift with it.
          updateCollectionItem(collection, renamed.slug, { ...renamed, draftData: null });
          // Both addresses, and both for the same reason: the new one has no
          // cache entry yet, and the old one is still cached as a 200 that has
          // to become a redirect.
          try {
            await onAfterCollectionSave(collection, slug);
            await onAfterCollectionSave(collection, renamed.slug);
          } catch (revalidateErr) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] onAfterCollectionSave failed:", revalidateErr);
          }
          onRenamedRef.current?.(renamed.slug);
        } catch (err) {
          // The path slug, not the target: this surface is renaming from an
          // address the record already left. Repointing is the whole fix; the
          // rename itself is still there to be made from the right place.
          if (err instanceof CmsApiError && err.isMovedConflict && err.conflictingSlug) {
            repointToCanonical(err.conflictingSlug);
            setError(t("collections.recordMoved", { slug: err.conflictingSlug }));
          } else if (err instanceof CmsApiError && err.isAliasConflict) {
            // Recoverable, but only the user can decide: forcing it repoints
            // that address here and breaks whatever still links to it.
            setRenameConflict({ slug: target, conflictingSlug: err.conflictingSlug });
          } else if (err instanceof CmsApiError && err.isSlugTakenConflict) {
            setError(t("collections.renameTaken", { slug: err.conflictingSlug ?? target }));
          } else if (err instanceof CmsApiError && err.isArchivedConflict) {
            setError(t("collections.archivedConflict"));
            await refetch();
          } else if (err instanceof CmsApiError && err.isConflict) {
            setError(t("collections.versionConflict"));
            await refetch();
          } else if (err instanceof CmsApiError && err.isForbidden) {
            setError(t("collections.editForbidden"));
          } else if (err instanceof CmsApiError && err.status === 400) {
            setError(t("collections.renameDisabled"));
          } else {
            setError(/** @type {Error} */ (err).message);
          }
        }
      });
    },
    [
      collection, slug, collectionStore, getAccessToken, config, draftQueue,
      setCollectionDraftSavedAt, clearCollectionDraft, invalidateCollectionItem,
      updateCollectionItem, onAfterCollectionSave, refetch, repointToCanonical, t,
    ],
  );

  // Memoised, and deliberately free of anything that moves per keystroke: this
  // object goes into the record's scope, so its identity is what decides
  // whether typing in one field re-renders the whole record. The values
  // themselves are reached through `editorId`.
  return useMemo(
    () => ({
      schema,
      slugSource,
      item,
      editorId,
      readValues,
      setValues: setValuesFromUser,
      save,
      undoDraft,
      archive,
      restore,
      rename,
      canRename,
      renameConflict,
      dismissRenameConflict,
      hasDraft,
      canEdit,
      isArchived,
      isVirtual,
      isPending,
      error,
      draftStatus,
      lastDraftSavedAt,
      publishedFlash,
      meLoading,
      meError: /** @type {Error | null} */ (meError ?? null),
      itemLoading,
      itemError: /** @type {Error | null} */ (itemError ?? null),
      refetch,
      collection,
      slug,
    }),
    [
      schema, slugSource, item, editorId, readValues, setValuesFromUser,
      save, undoDraft, archive, restore, rename, canRename, renameConflict,
      dismissRenameConflict, hasDraft, canEdit, isArchived,
      isVirtual, isPending, error,
      draftStatus, lastDraftSavedAt, publishedFlash, meLoading, meError,
      itemLoading, itemError, refetch, collection, slug,
    ],
  );
}

/**
 * Whether a publish would send anything: the live overlay draft unioned with
 * the server's. A hook rather than a field on the editor state, because the
 * overlay flips on the first keystroke and the editor object must keep its
 * identity across one (it is what the record scope hangs off).
 *
 * @param {CollectionEditorState} editor
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

/**
 * Zero-padded HH:MM wall-clock string.
 *
 * @param {Date} d
 * @returns {string}
 */
function formatClock(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
