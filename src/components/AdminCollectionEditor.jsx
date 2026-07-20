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

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsContext } from "../lib/context.js";
import { useCollectionContext } from "../lib/collection-context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
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
  TEXT_MID,
  TEXT_FAINT,
  FONT_MONO,
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

const DRAFT_DEBOUNCE_MS = 1000;

/**
 * @typedef {Object} CollectionEditorState
 * @property {import("../lib/schemas.js").CollectionSchema | null} schema
 * @property {string | null} slugSource
 * @property {import("../lib/schemas.js").CollectionItemResponse | null} item
 * @property {Record<string, *> | null} values
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
 * @returns {CollectionEditorState}
 */
export function useCollectionEditor(collection, slug) {
  const { config, getAccessToken } = useCmsContext();
  const {
    updateCollectionItem,
    patchCollectionItem,
    setCollectionDraft,
    clearCollectionDraft,
  } = useCollectionContext();
  const { collections: my, isLoading: meLoading, error: meError } = useMyCollections();
  // Read the raw item (overlayDrafts: false): consuming our own overlay would
  // re-fire the seeding effect every keystroke and stall the autosave debounce.
  const { item, isLoading: itemLoading, error: itemError, refetch } = useCollectionItem(
    collection,
    slug,
    { overlayDrafts: false },
  );

  const meta = my.find((c) => c.collectionKey === collection) ?? null;
  const schema = meta?.schema ?? null;
  const slugSource = meta?.slugSource ?? null;

  const [values, setValues] = useState(/** @type {Record<string, *> | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isPending, startTransition] = useTransition();
  const [draftStatus, setDraftStatus] = useState(
    /** @type {"idle"|"saving"|"failed"} */ ("idle"),
  );
  // HH:MM of the last successful autosave, held in the indicator (cleared when
  // the server draft disappears on publish/undo) so the admin sees when it landed.
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState(
    /** @type {string | null} */ (null),
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

  // Seed form state once schema + item arrive, preferring the draft over
  // published data so in-flight edits survive reloads. Skip the reseed when the
  // baseline matches `lastSyncedRef` (the cache change is our own autosave), so
  // we don't clobber keystrokes the user typed after the PUT fired.
  useEffect(() => {
    if (!schema) return;
    const baseline = item?.draftData ?? item?.data ?? {};
    const seeded = seedValues(schema.fields, baseline);
    // Normalise through the same seed->buildPayload pipeline the autosave
    // compares against; storing the raw baseline would leave `lastSyncedRef` out
    // of step (readOnly strip, default-fill, Number->null) and the first
    // autosave would PUT a phantom diff.
    const serialized = stableStringify(buildPayload(schema.fields, seeded));
    if (serialized === lastSyncedRef.current) return;
    setValues(seeded);
    lastSyncedRef.current = serialized;
  }, [schema, item]);

  useEffect(() => () => {
    if (failedResetRef.current) clearTimeout(failedResetRef.current);
  }, []);

  // Clear the timestamp when the server draft goes away (publish/undo drop
  // `draftData`), so it doesn't point at a draft that no longer exists.
  useEffect(() => {
    if (item?.draftData == null) setLastDraftSavedAt(null);
  }, [item?.draftData]);

  // Debounced draft autosave (1s after the last change), PUT to the item-draft
  // endpoint for published rows or the new-item-draft endpoint for virtual ones.
  // Write-only: a publish auto-clears the slot and the seeding effect resyncs
  // `lastSyncedRef`, preventing a loop against the just-saved value.
  useEffect(() => {
    if (!schema || !values) return undefined;
    if (!item?.canEdit) return undefined;
    if (isPending) return undefined;

    const payload = buildPayload(schema.fields, values);
    const serialized = stableStringify(payload);

    // Live-preview overlay for page-side consumers, pushed on every change so
    // they re-render in lockstep. Typing back to the server's view drops the
    // overlay so they fall back to `draftData ?? data`.
    if (serialized === lastSyncedRef.current) {
      clearCollectionDraft(collection, slug);
      return undefined;
    }
    setCollectionDraft(collection, slug, payload);

    const isVirtualNow = !item || item.version === 0;
    let cancelled = false;
    const timer = setTimeout(async () => {
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
        if (cancelled) return;
        lastSyncedRef.current = serialized;
        // Patch the cache so `hasDraft` flips immediately. In-place so list
        // windows don't refetch and overwrite it with the pre-cleanup state.
        if (!isVirtualNow && item) {
          patchCollectionItem(collection, slug, { ...item, draftData: payload });
        }
        setDraftStatus("idle");
        setLastDraftSavedAt(formatClock(new Date()));
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection draft autosave failed:", err);
        setDraftStatus("failed");
        if (failedResetRef.current) clearTimeout(failedResetRef.current);
        failedResetRef.current = setTimeout(() => {
          setDraftStatus("idle");
          failedResetRef.current = null;
        }, 4000);
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, item, schema, slugSource, slug, collection, isPending]);

  const isVirtual = !item || item.version === 0;
  const canEdit = item?.canEdit ?? false;
  const hasDraft = item?.draftData != null;

  const save = () => {
    setError(null);
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
            version: isVirtual ? null : item.version,
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
  };

  // Revert local edits to the published baseline. Optimistically clears
  // `draftData` on the cached item so `hasDraft` flips off (badge + dirty
  // icon disappear) the moment the user clicks Geri al. The seeding
  // effect then reseeds `values` + `lastSyncedRef` from `item.data`, so
  // the autosave effect's next pass is a no-op (no re-overlay, no PUT).
  // Backend cleanup is a fire-and-forget PUT of the published payload:
  // there's no draft DELETE endpoint, but the backend auto-clears its
  // Redis slot when draft === published.
  const undoDraft = () => {
    clearCollectionDraft(collection, slug);
    if (!schema || !item || item.draftData == null) return;
    setError(null);
    const publishedData = item.data;
    // In-place patch, not `updateCollectionItem`, so list windows don't refetch
    // and re-seed from the server's still-dirty state before the cleanup PUT.
    patchCollectionItem(collection, slug, { ...item, draftData: null });
    if (item.version === 0) return;
    (async () => {
      try {
        const token = await getAccessToken();
        await config.transport.saveCollectionItemDraft(
          collection, slug, { data: publishedData }, { accessToken: token },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection undo draft cleanup failed:", err);
      }
    })();
  };

  return {
    schema,
    slugSource,
    item,
    values,
    setValues,
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
  };
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
 * }} props
 */
export function AdminCollectionEditor({ editor, showMetaRow = true, showActions = true }) {
  const {
    collection, slug,
    schema, item, values, setValues,
    save, hasDraft, canEdit, isVirtual,
    isPending, error, draftStatus, lastDraftSavedAt, publishedFlash,
    meLoading, meError, itemLoading, itemError,
  } = editor;

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

  const disabled = isPending || !canEdit;

  return (
    <div style={containerStyle}>
      {showMetaRow ? (
        <div style={metaRowStyle}>
          <span style={metaLabelStyle}>{collection}</span>
          <span style={metaSlugStyle}>{slug}</span>
          {hasDraft ? <span style={draftBadgeStyle}>taslak</span> : null}
          <span style={metaVersionStyle}>
            {isVirtual ? "yeni" : `v${item.version}`}
          </span>
          {!canEdit ? <span style={metaReadonlyStyle}>readonly</span> : null}
        </div>
      ) : null}

      {isVirtual && canEdit ? (
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

      {canEdit && showActions ? (
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
  fontSize: 11,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  letterSpacing: "0.04em",
});

const metaLabelStyle = /** @type {React.CSSProperties} */ ({
  color: COLLECTION_ACCENT,
  textTransform: "uppercase",
});

const metaSlugStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MID,
});

const metaVersionStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  marginLeft: "auto",
});

const metaReadonlyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textTransform: "uppercase",
  fontSize: 10,
  padding: "1px 6px",
  background: SURFACE_2,
  borderRadius: R_BADGE,
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