"use client";

/**
 * @file `AdminCollectionEditor`: schema-driven form + direct-PUT save for one
 * collection row. Shared by the Page-tab Collection cards and the Region-tab
 * item cards.
 *
 * State lives in `useCollectionEditor(collection, slug)` so the surrounding
 * card can render header controls (the "Geri al" reset) against the same state;
 * the component itself is presentational. Schema comes from the /me cache, the
 * item from the shared item cache; save goes through `upsertCollectionItem` and
 * is written back via `updateCollectionItem` so other surfaces re-render.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsContext } from "../lib/context.js";
import { useCollectionContext } from "../lib/collection-context.js";
import { useStoreSelector } from "../lib/store.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useCollectionMeta, useMyCollections } from "../hooks/use-my-collections.js";
import { itemDraftKey, newDraftKey } from "../lib/draft-keys.js";
import { CmsApiError } from "../lib/errors.js";
import { stableStringify } from "../lib/stable-stringify.js";

import {
  CollectionFieldsForm,
  seedValues,
  buildPayload,
  requiredMissing,
  humanizeCollectionError,
} from "./editors/CollectionFieldsForm.jsx";
import {
  TEXT_MUTED,
  TEXT_FAINT,
  FONT_MONO,
  FONT_SANS,
  STATUS_OK,
  STATUS_WARN,
  STATUS_DANGER,
  ACCENT,
  SURFACE_1,
  SURFACE_2,
  HAIRLINE,
  COLLECTION_ACCENT,
  COLLECTION_SOFT,
  COLLECTION_LINE,
  R_BADGE,
  R_PILL,
  buttonBaseStyle,
} from "./admin-drawer-styles.js";


/**
 * @typedef {Object} CollectionEditorState
 * @property {import("../lib/schemas.js").CollectionSchema | null} schema
 * @property {string | null} slugSource
 * @property {import("../lib/schemas.js").CollectionItemResponse | null} item
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
 * @property {boolean} hasDraft
 * @property {boolean} canEdit
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
 * @returns {CollectionEditorState}
 */
export function useCollectionEditor(collection, slug, { active = true, mirror = true, scopeId } = {}) {
  const { config, getAccessToken, onAfterCollectionSave } = useCmsContext();
  const {
    collectionStore,
    draftQueue,
    updateCollectionItem,
    patchCollectionItem,
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
  // Read inside the edit handler so it keeps one identity: the item moves on
  // every cache write (roughly once per autosave), and re-binding the handler
  // that often would churn the record scope the fields hang off.
  const itemRef = useRef(item);
  itemRef.current = item;

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
      // Typed back to the server's view: drop the overlay so consumers fall
      // back to `draftData ?? data` instead of holding an identical copy.
      if (stableStringify(payload) === lastSyncedRef.current) {
        clearCollectionDraft(collection, slug);
      } else {
        setCollectionDraft(collection, slug, payload);
      }
    },
    [
      editorId, setEditorValues, active, mirror, schema, collection, slug,
      setCollectionDraft, clearCollectionDraft,
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
  // endpoint for published rows or the new-item-draft endpoint for virtual ones.
  // Reads the shared draft rather than local `values`, so the driver sends an
  // edit whichever surface typed it. Write-only: a publish auto-clears the slot
  // and the seeding effect resyncs `lastSyncedRef`, preventing a loop against
  // the just-saved value.
  useEffect(() => {
    if (!active) return undefined;
    if (!schema || !item?.canEdit) return undefined;
    if (isPending) return undefined;
    if (localDraft === undefined) return undefined;

    const payload = localDraft;
    const serialized = stableStringify(payload);
    if (serialized === lastSyncedRef.current) return undefined;

    const isVirtualNow = !item || item.version === 0;
    // Endpoint-keyed, so a virtual row and an open composer share one lane
    // instead of racing for the collection's single new-item slot.
    const queueKey = isVirtualNow ? newDraftKey(collection) : itemDraftKey(collection, slug);

    // No cleanup that cancels: re-scheduling the same key already replaces the
    // pending write, and a draft the user typed should still reach the server
    // when the surface showing it unmounts.
    draftQueue.schedule(queueKey, async (ctx) => {
      try {
        const token = await getAccessToken();
        setDraftStatus("saving");
        // Editing resumed, so the "Veri kaydedildi" flash no longer holds.
        setPublishedFlash(false);
        if (isVirtualNow) {
          // AutoGenerated derives the slug on publish (don't send one);
          // RoleDerived / UserDefined need it to identify the virtual entry.
          const body = slugSource === "AutoGenerated"
            ? { data: payload }
            : { slug, data: payload };
          await config.transport.saveCollectionNewDraft(collection, body, { accessToken: token });
        } else {
          await config.transport.saveCollectionItemDraft(collection, slug, { data: payload }, { accessToken: token });
        }
        // An undo landed while this was in flight: it already cleared the
        // draft, so writing our sent value back would re-create it.
        if (ctx.isStale()) return;
        lastSyncedRef.current = serialized;
        // Patch the cache so `hasDraft` flips immediately. In-place so list
        // windows don't refetch and overwrite it with the pre-cleanup state.
        if (!isVirtualNow && item) {
          patchCollectionItem(collection, slug, { ...item, draftData: payload });
        }
        setDraftStatus("idle");
        setCollectionDraftSavedAt(collection, slug, formatClock(new Date()));
      } catch (err) {
        if (ctx.isStale()) return;
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
  }, [active, localDraft, item, schema, slugSource, slug, collection, isPending]);

  const isVirtual = !item || item.version === 0;
  const canEdit = item?.canEdit ?? false;
  const hasDraft = item?.draftData != null;

  const save = useCallback(() => {
    setError(null);
    const values = readValues();
    if (!schema || !values) return;
    const missing = requiredMissing(schema.fields, values);
    if (missing) {
      setError(`Zorunlu alan eksik: ${missing}`);
      return;
    }
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        const saved = await config.transport.upsertCollectionItem(
          collection,
          slug,
          {
            data: buildPayload(schema.fields, values),
            version: itemRef.current && itemRef.current.version !== 0 ? itemRef.current.version : null,
          },
          { accessToken: token },
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
        if (err instanceof CmsApiError && err.isConflict) {
          setError("Versiyon çakışması — liste yenilendi, kontrol edip tekrar dene.");
          await refetch();
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError("Bu kaydı düzenleme yetkin yok.");
        } else if (err instanceof CmsApiError && err.status === 400) {
          // Map the backend's `works[0].title` path notation onto schema
          // labels so the banner reads "Çalışmalar #1 → Başlık".
          setError(humanizeCollectionError(err.detail, schema.fields) ?? `Geçersiz veri: ${err.message}`);
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  }, [
    schema, collection, slug, readValues, getAccessToken, config,
    updateCollectionItem, clearCollectionDraft, onAfterCollectionSave, refetch,
  ]);

  // Revert local edits to the published baseline. Optimistically clears
  // `draftData` on the cached item so `hasDraft` flips off (badge + dirty
  // icon disappear) the moment the user clicks Geri al. The seeding
  // effect then reseeds `values` + `lastSyncedRef` from `item.data`, so
  // the autosave effect's next pass is a no-op (no re-overlay, no PUT).
  // Backend cleanup is a fire-and-forget DELETE, not an echo-PUT of the
  // published payload: an echo can lose a race with a concurrent publish
  // (the payload it sends is no longer the current published value, so it
  // recreates a draft instead of clearing one) — DELETE can't.
  const undoDraft = useCallback(() => {
    clearCollectionDraft(collection, slug);
    const item = itemRef.current;
    if (!schema || !item || item.draftData == null) return;
    setError(null);
    // In-place patch, not `updateCollectionItem`, so list windows don't refetch
    // and re-seed from the server's still-dirty state before the cleanup DELETE.
    patchCollectionItem(collection, slug, { ...item, draftData: null });
    if (item.version === 0) return;
    // Cancel first, then queue: a pending autosave for this record is now
    // obsolete, and one already in flight must land before the DELETE or the
    // cleanup would be undone by the write it overtook.
    const queueKey = itemDraftKey(collection, slug);
    draftQueue.cancel(queueKey);
    draftQueue.enqueue(queueKey, async () => {
      try {
        const token = await getAccessToken();
        await config.transport.deleteCollectionItemDraft(
          collection, slug, { accessToken: token },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection undo draft cleanup failed:", err);
      }
    });
  }, [
    schema, collection, slug, clearCollectionDraft, patchCollectionItem,
    draftQueue, getAccessToken, config,
  ]);

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
      hasDraft,
      canEdit,
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
      save, undoDraft, hasDraft, canEdit, isVirtual, isPending, error,
      draftStatus, lastDraftSavedAt, publishedFlash, meLoading, meError,
      itemLoading, itemError, refetch, collection, slug,
    ],
  );
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
 * Presentational editor body. `editor` carries all state + handlers from
 * `useCollectionEditor`; the parent card drives the hook so it can also render
 * header controls against the same state. `showActions: false` drops the
 * indicator + Kaydet row for hosts (the region detail pane) that render their
 * own footer against the same editor state.
 *
 * @param {{
 *   editor: CollectionEditorState,
 *   showMetaRow?: boolean,
 *   showActions?: boolean,
 *   readOnly?: boolean,
 * }} props
 *   `readOnly` locks the form from outside the record's own permissions: an
 *   enclosing `<CmsGroup editable={false}>` covers its collection rows too.
 */
export function AdminCollectionEditor({ editor, showMetaRow = true, showActions = true, readOnly = false }) {
  const {
    collection, slug, editorId,
    schema, item, setValues,
    save, hasDraft, canEdit, isVirtual,
    isPending, error, draftStatus, lastDraftSavedAt, publishedFlash,
    meLoading, meError, itemLoading, itemError,
  } = editor;
  const values = useEditorValues(editorId);

  if (meLoading || itemLoading) {
    return <div style={hintStyle}>Yükleniyor…</div>;
  }
  if (meError) {
    return <div style={errorStyle}>Erişim listesi alınamadı: {meError.message}</div>;
  }
  if (itemError && !(itemError instanceof CmsApiError && itemError.isNotFound)) {
    return <div style={errorStyle}>{collection}/{slug} alınamadı: {itemError.message}</div>;
  }
  if (!schema) {
    return (
      <div style={hintStyle}>
        <code>{collection}</code> collection'ına bu oturumda erişimin yok — düzenleyemezsin.
      </div>
    );
  }
  if (!values) {
    return null;
  }

  // A group-level lock is as final as the record's own permissions here.
  const editable = canEdit && !readOnly;
  const disabled = isPending || !editable;

  return (
    <div style={containerStyle}>
      {showMetaRow ? (
        <div style={metaRowStyle}>
          <span style={metaVersionStyle}>
            {/* With a draft pending, the number reads ahead by one: that is the
                version this edit becomes on publish, and the badge beside it
                says it isn't there yet. */}
            {isVirtual ? "Yeni kayıt" : `Sürüm ${hasDraft ? item.version + 1 : item.version}`}
          </span>
          {hasDraft ? <span style={draftBadgeStyle}>taslak</span> : null}
          {!editable ? <span style={metaReadonlyStyle}>salt okunur</span> : null}
        </div>
      ) : null}

      {isVirtual && editable ? (
        <div style={virtualHintStyle}>
          Bu kayıt henüz yok — ilk Kaydet'te oluşturulur.
        </div>
      ) : null}

      <CollectionFieldsForm
        fields={schema.fields}
        values={values}
        onChange={setValues}
        disabled={disabled}
      />

      {error ? <div style={errorStyle}>{error}</div> : null}

      {editable && showActions ? (
        <div style={actionsRowStyle}>
          <DraftIndicator
            status={draftStatus}
            lastSavedAt={lastDraftSavedAt}
            hasServerDraft={item?.draftData != null}
            publishedFlash={publishedFlash}
          />
          <button
            type="button"
            onClick={save}
            disabled={disabled}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Per-card autosave indicator, matching the panel's `HeaderStatusPill` chrome
 * and dot tones. Stays mounted as a dot-only anchor when clean so the row's
 * rhythm doesn't jump when state arrives.
 *
 * @param {{
 *   status: "idle" | "saving" | "failed",
 *   lastSavedAt: string | null,
 *   hasServerDraft: boolean,
 *   publishedFlash: boolean,
 * }} props
 */
export function DraftIndicator({ status, lastSavedAt, hasServerDraft, publishedFlash }) {
  /** @type {{ state: string, bg: string, glow: string, pulse: boolean, label: React.ReactNode }} */
  let view;

  if (status === "saving") {
    view = {
      state: "saving",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: "Kaydediliyor…",
    };
  } else if (status === "failed") {
    view = {
      state: "failed",
      bg: STATUS_DANGER,
      glow: "none",
      pulse: false,
      label: "Kaydedilemedi",
    };
  } else if (publishedFlash) {
    view = {
      state: "published",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: "Veri kaydedildi",
    };
  } else if (lastSavedAt) {
    view = {
      state: `saved:${lastSavedAt}`,
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: (
        <>
          Taslak kayıtlı
          <span style={indicatorTimeStyle}>{lastSavedAt}</span>
        </>
      ),
    };
  } else if (hasServerDraft) {
    // Server draftData but no autosave this session, e.g. a card reopened with
    // a previously-stashed draft.
    view = {
      state: "stashed",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: "Taslak kayıtlı",
    };
  } else {
    view = {
      state: "idle",
      bg: TEXT_FAINT,
      glow: "none",
      pulse: false,
      label: null,
    };
  }

  return (
    <motion.div
      layout
      layoutDependency={view.state}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
      style={{ ...indicatorPillStyle, transformOrigin: "center", overflow: "hidden" }}
    >
      <span
        className={view.pulse ? "inscribed-status-pulse" : undefined}
        style={{ ...indicatorDotStyle, background: view.bg, boxShadow: view.glow }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {view.label != null ? (
          <motion.span
            key={view.state}
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0.18, 1] }}
            style={indicatorLabelStyle}
          >
            {view.label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
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

// ---- Styles --------------------------------------------------------------

const containerStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const metaRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  font: `400 11px/1 ${FONT_SANS}`,
  fontVariantNumeric: "tabular-nums",
});

const metaVersionStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
});

const metaReadonlyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontSize: 10,
  padding: "1px 6px",
  background: SURFACE_2,
  borderRadius: R_BADGE,
  marginLeft: "auto",
});

const virtualHintStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 12,
  color: TEXT_MUTED,
  padding: "6px 10px",
  background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${ACCENT} 15%, transparent)`,
  borderRadius: R_BADGE,
});

const hintStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontSize: 12,
});

const errorStyle = /** @type {React.CSSProperties} */ ({
  color: `color-mix(in srgb, ${STATUS_DANGER} 55%, #fff)`,
  fontSize: 12,
  padding: "6px 10px",
  background: `color-mix(in srgb, ${STATUS_DANGER} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${STATUS_DANGER} 30%, transparent)`,
  borderRadius: R_BADGE,
});

const saveButtonStyle = /** @type {React.CSSProperties} */ ({
  ...buttonBaseStyle,
  marginLeft: "auto",
  fontWeight: 600,
});

const actionsRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const draftBadgeStyle = /** @type {React.CSSProperties} */ ({
  textTransform: "uppercase",
  fontSize: 9,
  letterSpacing: "0.06em",
  padding: "1px 6px",
  color: COLLECTION_ACCENT,
  background: COLLECTION_SOFT,
  border: `1px solid ${COLLECTION_LINE}`,
  borderRadius: R_BADGE,
});

// Pill chrome cloned from the panel's `HeaderStatusPill` so the two
// surfaces feel like one component family. `minHeight` locks the
// vertical axis: the empty (dot-only) anchor and the label state share
// the same height so only horizontal width animates as labels swap.
const indicatorPillStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 22,
  padding: "0 10px",
  borderRadius: R_PILL,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  flexShrink: 0,
});

const indicatorDotStyle = /** @type {React.CSSProperties} */ ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  flexShrink: 0,
  display: "inline-block",
  transition: "background 220ms ease, box-shadow 220ms ease",
});

const indicatorLabelStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 12,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
});

const indicatorTimeStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: TEXT_FAINT,
});