"use client";

/**
 * @file One block row in the drawer's block list, weight-dispatched:
 *
 * Field-weight types (ShortText/LongText/Date/Link) render as
 * `FieldRow` — an always-open labeled form field (mono path label + editor),
 * no collapse chrome. Heavy types (RichText/Image/List/Collection/unknown)
 * stay collapsible cards whose closed header shows a value preview.
 *
 * Card header (left to right): TypeIcon badge, mono blockPath, value preview
 * (closed only), (when dirty) sage dot + Undo, chevron. Bodies slide via
 * `.inscribed-collapse`; Collection bodies stay mounted across collapse so the
 * inner `useCollectionItem` fetch isn't replayed on reopen.
 *
 * Collection blocks get a dedicated lane in `CollectionBlockCard.jsx`, loaded
 * lazily: it is the drawer's only reach into the collections layer, so an app
 * without collections leaves that graph unfetched.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Undo2, Lock } from "../shared/style/icons.jsx";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useInert } from "../shared/ui/use-inert.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { isBlockDirty, resolveBlockValue } from "../core/resolve.js";

import { FieldEditor } from "../editors/fields/FieldEditor.jsx";
import { ListEditor } from "../editors/fields/ListEditor.jsx";
import { BlockConflictNotice } from "./BlockConflictNotice.jsx";
import { TranslationPrompt } from "./TranslationPrompt.jsx";
import { CardHeader, TypeIcon, disclosureBodyStyle, disclosureRowStyle, fieldPathStyle, rowClassName, rowInsetStyle } from "./block-card-chrome.jsx";
import { blockResetStyle, dirtyDotStyle } from "./drawer-styles.js";
import { TEXT_MUTED, HAIRLINE, R_MD } from "../shared/style/tokens.js";

const CollectionLane = dynamic(
  () => import("./CollectionBlockCard.jsx").then((m) => m.CollectionLane),
  { ssr: false },
);

// Field-weight types: a single light editor, rendered always-open as a form
// field. Everything else (RichText/Image/List/Collection/unknown) keeps the
// collapsible card surface.
const INLINE_TYPES = new Set(["ShortText", "LongText", "Date", "Link"]);

/**
 * @import { BlockResponse, ItemSchema } from "../shared/contracts/schemas.js"
 */

/**
 * Everything a card needs to edit its own block, read here rather than handed
 * down from the drawer. The drawer re-renders on every keystroke in any field
 * (it aggregates the dirty count), so props carrying the draft or freshly-built
 * arrow handlers would drag every card along with it; a per-path subscription
 * plus stable callbacks let `BlockCard`'s memo hold instead.
 *
 * @param {BlockResponse} block
 */
function useBlockDraft(block) {
  const { contentDraftsStore, setDraft, setActiveBlock, uiStore, clearBlockConflict } =
    useCmsContext();
  const blockPath = block.blockPath;

  // Two selectors (presence + value) so an explicit empty draft stays
  // distinguishable from "no draft", same as `<EditableRegion>`.
  const hasDraft = useStoreSelector(contentDraftsStore, (m) => m.has(blockPath));
  const draft = useStoreSelector(contentDraftsStore, (m) => m.get(blockPath));
  // Membership as a boolean, so a conflict elsewhere on the page leaves this
  // card alone.
  const hasConflict = useStoreSelector(uiStore, (s) => s.conflictBlocks.has(blockPath));

  const onChange = useCallback(
    /** @param {*} value */
    (value) => setDraft(blockPath, value),
    [setDraft, blockPath],
  );
  const onReset = useCallback(
    () => resetBlock(block, setDraft),
    [block, setDraft],
  );
  const onFocus = useCallback(
    () => setActiveBlock(blockPath),
    [setActiveBlock, blockPath],
  );

  // The refetch behind the 409 already put the other editor's value in
  // `block.value`, so taking theirs is the ordinary per-block undo.
  const onTakeTheirs = useCallback(() => {
    resetBlock(block, setDraft);
    clearBlockConflict(blockPath);
  }, [block, setDraft, clearBlockConflict, blockPath]);

  // Keeping mine needs no write: the draft already holds it, and the next save
  // sends it at the version the refetch brought in.
  const onKeepMine = useCallback(
    () => clearBlockConflict(blockPath),
    [clearBlockConflict, blockPath],
  );

  return { draft, hasDraft, hasConflict, onChange, onReset, onFocus, onTakeTheirs, onKeepMine };
}

/**
 * @param {{
 *   block: BlockResponse,
 *   isActive: boolean,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 * }} props
 */
export const BlockCard = memo(function BlockCard(props) {
  if (props.block.blockType === "Collection") {
    return (
      <CollectionLane
        block={props.block}
        isActive={props.isActive}
        readOnly={props.readOnly}
        topLevel={props.topLevel}
        displayPath={props.displayPath}
      />
    );
  }
  if (INLINE_TYPES.has(props.block.blockType)) {
    return <FieldRow {...props} />;
  }
  return <RegularBlockCard {...props} />;
});

/**
 * Always-open form field for field-weight blocks: mono path label on top
 * (dirty dot + undo + lock live on the label row), the editor below. Active
 * state (page region clicked) scrolls into view and lights the left rail via
 * `.is-active`.
 *
 * @param {{
 *   block: BlockResponse,
 *   isActive: boolean,
 *   readOnly?: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 * }} props
 */
function FieldRow({ block, isActive, readOnly, topLevel, displayPath }) {
  const t = useCmsStrings();
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const {
    draft, hasDraft, hasConflict, onChange, onReset, onFocus, onTakeTheirs, onKeepMine,
  } = useBlockDraft(block);

  const effective = resolveBlockValue(block);
  const value = resolveBlockValue(block, hasDraft, draft);
  const isDirty = !readOnly && isBlockDirty(block, hasDraft, draft);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      className={`inscribed-field-row${isActive ? " is-active" : ""}`}
      style={rowInsetStyle(fieldRowStyle, topLevel)}
      onMouseDown={onFocus}
    >
      <div style={fieldLabelRowStyle}>
        <TypeIcon type={block.blockType} compact={topLevel} />
        <span style={fieldPathStyle} title={block.blockPath}>{displayPath ?? block.blockPath}</span>
        {isDirty ? (
          <span style={dirtyDotStyle} aria-label={t("block.unsavedDot")} />
        ) : null}
        {isDirty ? (
          <button
            type="button"
            onClick={onReset}
            className="inscribed-icon-button"
            style={blockResetStyle}
            aria-label={t("block.undoThis")}
            title={t("block.undo")}
          >
            <Undo2 size={13} />
          </button>
        ) : null}
        {readOnly ? (
          <span
            style={{ display: "inline-flex", color: TEXT_MUTED }}
            title={t("block.readOnlyTitle")}
            aria-label={t("block.readOnly")}
          >
            <Lock size={12} />
          </span>
        ) : null}
      </div>
      {/* Plain boxes. The notices animate their own height, so the editor
          between them travels by ordinary reflow. A `layout` projection here
          animated every positional delta instead of only that one, which is
          what made these cards drift up and down on a route change: global
          blocks keep their identity across pages, so the projection measured
          the previous page's position and slid them to the new one. */}
      <div style={fieldEditorWrapStyle}>
        <BlockConflictNotice
          show={hasConflict}
          block={block}
          draft={value}
          onTakeTheirs={onTakeTheirs}
          onKeepMine={onKeepMine}
        />
        <div style={editorSlotStyle}>
          <FieldEditor
            blockType={block.blockType}
            value={value}
            onChange={onChange}
            disabled={readOnly}
            hideLabel
          />
          <TranslationPrompt block={block} value={value} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

// No negative margins: group bodies clip via the collapse wrapper's
// `overflow: hidden`, so an overhanging row gets sheared at both sides. The
// 12px padding doubles as the active ring's cushion around label + editor.
const fieldRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "6px 12px 8px",
  borderRadius: R_MD,
});

const fieldLabelRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 22,
});

// Same guide-line geometry as disclosureBodyStyle (line centred under the
// 20px icon), so open fields and opened heavy blocks indent identically.
const fieldEditorWrapStyle = /** @type {React.CSSProperties} */ ({
  margin: "0 0 0 9px",
  padding: "2px 0 2px 14px",
  borderLeft: `1px solid ${HAIRLINE}`,
  display: "flex",
  flexDirection: "column",
});

// Transparent slot whose only job is to give the editor a projected box, so it
// travels when the conflict panel above it comes and goes. Inherits the column
// flow it replaces, so nothing about the editor's own layout changes.
const editorSlotStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

/**
 * @param {{
 *   block: BlockResponse,
 *   isActive: boolean,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 * }} props
 */
function RegularBlockCard({ block, isActive, itemSchema, readOnly, topLevel, displayPath }) {
  const t = useCmsStrings();
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const {
    draft, hasDraft, hasConflict, onChange, onReset, onFocus, onTakeTheirs, onKeepMine,
  } = useBlockDraft(block);

  const effective = resolveBlockValue(block);
  const value = resolveBlockValue(block, hasDraft, draft);
  // A read-only block carries no dirty state to surface, so suppress the
  // dot/reset/rail and let it read as a passive, locked view.
  const isDirty = !readOnly && isBlockDirty(block, hasDraft, draft);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  // A conflict is waiting on a decision that lives in the body, so a shut card
  // would hide the thing the banner just sent the user to.
  useEffect(() => {
    if (hasConflict) setIsOpen(true);
  }, [hasConflict]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) onFocus();
  };

  const bodyRef = useInert(!isOpen);

  return (
    <div
      ref={ref}
      className={rowClassName({ isActive, isCollection: false })}
      style={rowInsetStyle(disclosureRowStyle, topLevel)}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        readOnly={readOnly}
        topLevel={topLevel}
        displayPath={displayPath}
        preview={blockPreview(block.blockType, value, t)}
        onHeaderClick={handleHeaderClick}
        onReset={onReset}
      />
      <div
        ref={bodyRef}
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        {/* Plain, as in `FieldRow`: the notices carry their own height, and the
            `.inscribed-collapse` above already animates this body opening. A
            projection inside a collapsing box measured against a clipped height
            and fought it. */}
        <div style={disclosureBodyStyle}>
          <BlockConflictNotice
            show={hasConflict}
            block={block}
            draft={value}
            onTakeTheirs={onTakeTheirs}
            onKeepMine={onKeepMine}
          />
          <div style={editorSlotStyle}>
            {renderEditor(block, value, onChange, itemSchema, readOnly, t)}
            <TranslationPrompt block={block} value={value} readOnly={readOnly} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One-line value summary for a closed heavy card. Returns null when there is
 * nothing meaningful to show (the header then stays as-is).
 *
 * @param {string} blockType
 * @param {*} value
 * @returns {string | null}
 */
function blockPreview(blockType, value, t) {
  switch (blockType) {
    case "RichText": {
      if (typeof value !== "string") return null;
      const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return text || null;
    }
    case "Image": {
      if (!value || typeof value !== "object") return null;
      if (typeof value.alt === "string" && value.alt) return value.alt;
      if (typeof value.src === "string" && value.src) {
        const clean = value.src.split(/[?#]/)[0];
        return clean.slice(clean.lastIndexOf("/") + 1) || null;
      }
      return null;
    }
    case "List":
      return Array.isArray(value) ? t("block.items", { count: value.length }) : null;
    default:
      return null;
  }
}

/**
 * Per-block undo: pin the published value as the local draft rather than
 * dropping the entry, whether or not a server draft is known yet.
 * `draftValue == null` does not mean "the backend holds no draft", only "no PUT
 * has come back yet", and a write still in flight mirrors the value it sent
 * onto the block when it lands. With no local entry that mirror resurrects the
 * text just undone.
 *
 * The pinned draft is also what the next autosave flush sends, and that PUT is
 * what clears the backend's copy (the queue chains it behind the in-flight
 * write, so it runs against the mirrored `draftValue`). The provider drops the
 * entry once the round-trip has settled.
 *
 * @param {BlockResponse} block
 * @param {(blockPath: string, value: *) => void} setDraft
 */
function resetBlock(block, setDraft) {
  setDraft(block.blockPath, block.value);
}

/**
 * @param {BlockResponse} block
 * @param {*} value
 * @param {(value: *) => void} onChange
 * @param {ItemSchema | null} itemSchema
 * @param {boolean} [readOnly]
 */
function renderEditor(block, value, onChange, itemSchema, readOnly, t) {
  if (block.blockType === "List") {
    return <ListEditor blockPath={block.blockPath} value={value} onChange={onChange} itemSchema={itemSchema} disabled={readOnly} />;
  }
  const primitive = FieldEditor({ blockType: block.blockType, value, onChange, disabled: readOnly });
  if (primitive) return primitive;
  return (
    <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
      {t("block.noEditor", { type: block.blockType })}
    </div>
  );
}