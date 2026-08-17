"use client";

/**
 * @file `CollectionRecordForm`: the drawer's schema-driven form for one
 * collection row. Shared by the Page-tab Collection cards and the Region-tab
 * item cards.
 *
 * Presentational only: `editor` carries all state and handlers, driven by
 * `useCollectionEditor` in the parent card so that card can render
 * header-level controls (the "Geri al" reset) against the same state.
 */

import { AnimatePresence, motion } from "framer-motion";

import { CmsApiError } from "../shared/contracts/errors.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useEditorDirty, useEditorValues } from "../collections/hooks/use-collection-editor.js";
import { CollectionFieldsForm } from "../collections/CollectionFieldsForm.jsx";
import { buttonBaseStyle } from "./drawer-styles.js";
import { TEXT_MUTED, TEXT_FAINT, FONT_MONO, FONT_SANS, STATUS_OK, STATUS_WARN, STATUS_DANGER, ACCENT, SURFACE_1, SURFACE_2, HAIRLINE, COLLECTION_ACCENT, COLLECTION_SOFT, COLLECTION_LINE, R_BADGE, R_PILL } from "../shared/style/tokens.js";

/**
 * @import { CollectionEditorState } from "../collections/hooks/use-collection-editor.js"
 */

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
export function CollectionRecordForm({ editor, showMetaRow = true, showActions = true, readOnly = false }) {
  const t = useCmsStrings();
  const {
    collection, slug, editorId,
    schema, item, setValues,
    save, hasDraft, canEdit, isVirtual,
    isPending, error, draftStatus, lastDraftSavedAt, publishedFlash,
    meLoading, meError, itemLoading, itemError,
  } = editor;
  const values = useEditorValues(editorId);
  const isDirty = useEditorDirty(editor);

  if (meLoading || itemLoading) {
    return <div style={hintStyle}>{t("collections.loading")}</div>;
  }
  if (meError) {
    return <div style={errorStyle}>{t("collections.accessFailed", { message: meError.message })}</div>;
  }
  if (itemError && !(itemError instanceof CmsApiError && itemError.isNotFound)) {
    return (
      <div style={errorStyle}>
        {t("collections.recordFailed", { collection, slug, message: itemError.message })}
      </div>
    );
  }
  if (!schema) {
    return (
      <div style={hintStyle}>
        {t("collections.noAccess", { key: collection })}
      </div>
    );
  }
  if (!values) {
    return null;
  }

  // A group-level lock is as final as the record's own permissions here.
  const editable = canEdit && !readOnly;
  const disabled = isPending || !editable;
  const nothingToSave = !isDirty && !isVirtual;

  return (
    <div style={containerStyle}>
      {showMetaRow ? (
        <div style={metaRowStyle}>
          <span style={metaVersionStyle}>
            {/* With a draft pending, the number reads ahead by one: that is the
                version this edit becomes on publish, and the badge beside it
                says it isn't there yet. */}
            {isVirtual
              ? t("collections.newRecord")
              : t("collections.version", { version: hasDraft ? item.version + 1 : item.version })}
          </span>
          {hasDraft ? <span style={draftBadgeStyle}>{t("collections.draftBadge")}</span> : null}
          {!editable ? <span style={metaReadonlyStyle}>{t("block.readOnly")}</span> : null}
        </div>
      ) : null}

      {isVirtual && editable ? (
        <div style={virtualHintStyle}>
          {t("collections.virtualHint")}
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
            disabled={disabled || nothingToSave}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {isPending ? t("collections.saving") : t("status.save")}
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
  const t = useCmsStrings();
  /** @type {{ state: string, bg: string, glow: string, pulse: boolean, label: React.ReactNode }} */
  let view;

  if (status === "saving") {
    view = {
      state: "saving",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: t("collections.saving"),
    };
  } else if (status === "failed") {
    view = {
      state: "failed",
      bg: STATUS_DANGER,
      glow: "none",
      pulse: false,
      label: t("pill.failed"),
    };
  } else if (publishedFlash) {
    view = {
      state: "published",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: t("pill.published"),
    };
  } else if (lastSavedAt) {
    view = {
      state: `saved:${lastSavedAt}`,
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: (
        <>
          {t("pill.draftSaved")}
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
      label: t("pill.draftSaved"),
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