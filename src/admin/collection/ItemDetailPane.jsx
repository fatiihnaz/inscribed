"use client";

/**
 * @file `ItemDetailPane`: the pane for one existing collection row, plus the
 * heading that renames it.
 *
 * The slug is the heading, so renaming happens there rather than in a form
 * below that repeats what the heading already says; `SlugHeading`,
 * `SlugEditor` and `RenameNotice` are the three states of that one control.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArchiveRestore, Check, Pencil, Undo2, X } from "../../shared/style/icons.jsx";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { useDrawerDraftRole } from "../../collections/hooks/use-draft-driver.js";
import { useCollectionMeta } from "../../collections/hooks/use-my-collections.js";
import { imageFieldName, titleFieldName } from "./collection-format.js";
import { useCollectionEditor, useEditorDirty } from "../../collections/hooks/use-collection-editor.js";

import { CollectionRecordForm, DraftIndicator } from "../CollectionRecordForm.jsx";
import { DetailPane } from "./DetailPane.jsx";
import { RecordHeader } from "./RecordHeader.jsx";
import { btnGhostStyle } from "../drawer-styles.js";
import {
  readonlyChipStyle, archivedChipStyle, detailVersionStyle, archiveNoticeStyle,
  saveButtonStyle, detailTitleStyle, slugSlotStyle, slugCellStyle, slugButtonStyle,
  slugTextStyle, slugPencilStyle, slugInputStyle, slugIconButtonStyle,
  renameErrorStyle, renameWarningStyle, renameConfirmStyle,
} from "./collection-styles.js";

/**
 * Detail pane for one collection row, persisted or claim-derived.
 * `useCollectionEditor` is lifted here so the footer actions and the form body
 * share one state.
 *
 * @param {{
 *   collectionKey: string,
 *   slug: string,
 *   onBack: () => void,
 *   onOpenItem: (slug: string) => void,
 *   onAddTranslation: (locale: string, translationGroupId: string) => void,
 * }} props
 */
export function ItemDetailPane({ collectionKey, slug, onBack, onOpenItem, onAddTranslation }) {
  const t = useCmsStrings();
  // The pane is always on screen when mounted, so it mirrors; whether it also
  // writes depends on the page not already owning the record's draft.
  const role = useDrawerDraftRole(collectionKey, slug, true);
  // A rename lands the record at another address, and this pane is keyed by the
  // one it was opened at, so reopening at the new slug is what moves it. That
  // also remounts, which is what closes the heading's editor.
  const editor = useCollectionEditor(collectionKey, slug, { ...role, onRenamed: onOpenItem });
  const meta = useCollectionMeta(collectionKey);
  const titleField = titleFieldName(meta?.schema);
  const imageField = imageFieldName(meta?.schema);
  const dirty = useEditorDirty(editor);
  const isDirty = dirty && editor.canEdit;
  const nothingToSave = !dirty && !editor.isVirtual;
  const [renaming, setRenaming] = useState(false);

  const closeRename = () => {
    setRenaming(false);
    editor.dismissRenameConflict();
  };

  return (
    <DetailPane
      onBack={onBack}
      title={slug}
      // Null, not omitted: the header carries no heading because the record
      // card below it is the heading. `title` stays the string the pane is
      // announced by.
      titleContent={null}
      subhead={
        <>
          {renaming ? <RenameNotice editor={editor} /> : null}
          {/* The address is still the rename control, so it travels into the
              card as a node rather than the card owning the edit state. */}
          <RecordHeader
            editor={editor}
            titleField={titleField}
            imageField={imageField}
            dirty={isDirty}
            locales={meta?.locales}
            onOpenItem={onOpenItem}
            onAddTranslation={onAddTranslation}
            slugHeading={
              <SlugHeading
                editor={editor}
                slug={slug}
                editing={renaming}
                disabled={isDirty}
                onStart={() => setRenaming(true)}
                onClose={closeRename}
              />
            }
          />
        </>
      }
      // Kept through the edit rather than hidden for room. Dropping them gave
      // the row's width back the instant editing ended, which collapsed the
      // input that was still animating out and dragged its icons left with it.
      meta={
        <>
          {editor.isArchived ? (
            <span style={archivedChipStyle}>{t("collections.archivedBadge")}</span>
          ) : null}
          {editor.item && !editor.canEdit ? (
            <span style={readonlyChipStyle}>{t("block.readOnly")}</span>
          ) : null}
          {editor.item ? (
            <span style={detailVersionStyle}>
              {editor.isVirtual ? t("collections.newBadge") : `v${editor.item.version}`}
            </span>
          ) : null}
        </>
      }
      // An archived row has one action, and it is not save: every write against
      // it answers 409 until someone restores it.
      footer={!editor.canEdit ? null : editor.isArchived ? (
        <>
          <span style={archiveNoticeStyle}>{t("collections.archivedNotice")}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={editor.restore}
            disabled={editor.isPending}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            <ArchiveRestore size={13} />
            {t("collections.restore")}
          </button>
        </>
      ) : (
        <>
          <DraftIndicator
            status={editor.draftStatus}
            lastSavedAt={editor.lastDraftSavedAt}
            hasServerDraft={editor.item?.draftData != null}
            publishedFlash={editor.publishedFlash}
          />
          <span style={{ flex: 1 }} />
          {isDirty ? (
            <button
              type="button"
              onClick={editor.undoDraft}
              disabled={editor.isPending}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label={t("collections.undoRecord")}
              title={t("block.undo")}
            >
              <Undo2 size={13} />
            </button>
          ) : null}
          {/* Only a saved row can be archived; a virtual one has nothing to
              take down yet. */}
          {editor.isVirtual ? null : (
            <button
              type="button"
              onClick={editor.archive}
              disabled={editor.isPending}
              className="inscribed-btn-ghost"
              style={btnGhostStyle}
              aria-label={t("collections.archiveRecord")}
              title={t("collections.archiveRecord")}
            >
              <Archive size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={editor.save}
            disabled={editor.isPending || nothingToSave}
            className="inscribed-btn-collection"
            style={saveButtonStyle}
          >
            {editor.isPending ? t("collections.saving") : t("status.save")}
          </button>
        </>
      )}
    >
      <CollectionRecordForm editor={editor} showMetaRow={false} showActions={false} />
    </DetailPane>
  );
}

/**
 * The pane's heading: the record's slug, and the pencil that turns it into an
 * input. The address is what the heading already shows, so editing it anywhere
 * else would mean printing the same string twice and asking which one is live.
 *
 * @param {{
 *   editor: import("../../collections/hooks/use-collection-editor.js").CollectionEditorState,
 *   slug: string,
 *   editing: boolean,
 *   disabled: boolean,
 *   onStart: () => void,
 *   onClose: () => void,
 * }} props
 *   `disabled` is the unsaved-changes gate: renaming consumes a version, so a
 *   row with a pending edit has to settle it first. Disabled rather than hidden,
 *   with the reason in the tooltip.
 */
function SlugHeading({ editor, slug, editing, disabled, onStart, onClose }) {
  const t = useCmsStrings();

  if (!editor.canRename) {
    return <span style={detailTitleStyle} title={slug}>{slug}</span>;
  }

  // The two states share one grid cell, so they cross-fade over each other
  // rather than one leaving a gap for the other to fill. That also pins the
  // row: the cell is as tall as the taller state whichever one is showing, so
  // opening the editor moves nothing.
  //
  // The heading itself is the control, so the pencil is a mark at the end of
  // the slug rather than a button beside it: nothing here should read as a
  // second thing to press. Keyed on the mode, which is what remounts the editor
  // per edit, so the input always opens on the record's current slug rather
  // than on whatever was typed and abandoned last time.
  return (
    <div style={slugSlotStyle}>
      <AnimatePresence initial={false}>
        <motion.div
          key={editing ? "edit" : "view"}
          style={slugCellStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // The state on its way out still overlaps the one arriving, so it
          // stops taking clicks the moment it starts leaving.
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={SLUG_TRANSITION}
        >
          {editing ? (
            <SlugEditor editor={editor} slug={slug} onClose={onClose} />
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={disabled || editor.isPending}
              className="inscribed-slug-edit"
              style={slugButtonStyle}
              title={disabled ? t("collections.renameDirty") : t("collections.renameRecord")}
            >
              <span style={slugTextStyle}>{slug}</span>
              <Pencil size={11} className="inscribed-slug-pencil" style={slugPencilStyle} />
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Short enough that the heading reads as opening rather than as a scene change,
// on the curve the panel's other swaps already use.
const SLUG_TRANSITION = { duration: 0.16, ease: [0.32, 0.72, 0.18, 1] };

/**
 * @param {{
 *   editor: import("../../collections/hooks/use-collection-editor.js").CollectionEditorState,
 *   slug: string,
 *   onClose: () => void,
 * }} props
 */
function SlugEditor({ editor, slug, onClose }) {
  const t = useCmsStrings();
  const [value, setValue] = useState(slug);
  const { renameConflict, dismissRenameConflict, isPending, rename } = editor;

  const trimmed = value.trim();
  const submittable = trimmed !== "" && trimmed !== slug && !isPending;

  return (
    <>
      <input
        type="text"
        value={value}
        // Editing the target invalidates the warning it produced, which
        // otherwise sits there inviting a confirm for a slug nobody typed.
        onChange={(e) => {
          setValue(e.target.value);
          if (renameConflict) dismissRenameConflict();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (submittable) rename(trimmed);
          }
          // The pane closes on Escape, and while this is open that is the wrong
          // thing to lose: the key belongs to the input first.
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        disabled={isPending}
        spellCheck={false}
        autoFocus
        aria-label={t("collections.renameTitle")}
        placeholder={t("collections.slugPlaceholder")}
        title={t("collections.renameHint")}
        className="inscribed-slug-input"
        style={slugInputStyle}
      />
      {/* In from the edge they will sit at, a beat apart, so the row reads as
          the controls arriving rather than as two more things appearing. */}
      <motion.button
        type="button"
        onClick={onClose}
        disabled={isPending}
        className="inscribed-slug-icon"
        style={slugIconButtonStyle}
        initial={{ opacity: 0, x: 6 }}
        // The stagger belongs to the arrival only: carried on `transition` it
        // would delay the exit too, and hold the whole swap open waiting for it.
        animate={{ opacity: 1, x: 0, transition: { ...SLUG_TRANSITION, delay: 0.04 } }}
        exit={{ opacity: 0, x: 6 }}
        transition={SLUG_TRANSITION}
        aria-label={t("collections.renameCancel")}
        title={t("collections.renameCancel")}
      >
        <X size={13} />
      </motion.button>
      <motion.button
        type="button"
        onClick={() => { if (submittable) rename(trimmed); }}
        disabled={!submittable}
        // Disabled is exactly "nothing to submit", so the accent follows it
        // through CSS rather than being recomputed here.
        className="inscribed-slug-icon inscribed-slug-icon-confirm"
        style={slugIconButtonStyle}
        initial={{ opacity: 0, x: 6 }}
        animate={{ opacity: 1, x: 0, transition: { ...SLUG_TRANSITION, delay: 0.08 } }}
        exit={{ opacity: 0, x: 6 }}
        transition={SLUG_TRANSITION}
        aria-label={t("collections.renameSubmit")}
        title={t("collections.renameSubmit")}
      >
        <Check size={13} />
      </motion.button>
    </>
  );
}

/**
 * What sits under the heading while its slug is being edited, and only when
 * there is something to say: an alias clash that needs an answer, or any other
 * refusal. Nothing renders otherwise, so opening the editor moves nothing.
 *
 * The clash is the reason this is a notice rather than a toast: it is the one
 * failure the editor can act on, and acting on it takes an address off another
 * record, so it renders as a warning naming that record and a second, explicit
 * button, never as an automatic retry.
 *
 * @param {{ editor: import("../../collections/hooks/use-collection-editor.js").CollectionEditorState }} props
 */
function RenameNotice({ editor }) {
  const t = useCmsStrings();
  const { renameConflict, isPending, rename, error } = editor;

  if (renameConflict) {
    return (
      <div style={renameWarningStyle}>
        <span>
          {renameConflict.conflictingSlug
            ? t("collections.renameAliasWarning", {
                slug: renameConflict.slug,
                conflicting: renameConflict.conflictingSlug,
              })
            : t("collections.renameAliasWarningUnnamed", { slug: renameConflict.slug })}
        </span>
        <button
          type="button"
          onClick={() => rename(renameConflict.slug, { replaceAlias: true })}
          disabled={isPending}
          className="inscribed-btn-ghost"
          style={renameConfirmStyle}
        >
          {t("collections.renameAliasConfirm")}
        </button>
      </div>
    );
  }

  // Repeated from the form below on purpose: a refusal about the address should
  // be readable next to the address, not scrolled past the record's fields.
  if (error) return <div style={renameErrorStyle}>{error}</div>;

  return null;
}
