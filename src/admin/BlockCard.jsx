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
 * Collection blocks get a dedicated lane: `<CollectionBlockCard>` lifts the
 * editor's draft state so the header can show the "Geri al" reset.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Undo2, Lock, List as ListIcon } from "../shared/style/icons.jsx";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useStoreSelector } from "../shared/state/store.js";
import { isBlockDirty, resolveBlockValue } from "../core/resolve.js";
import { useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";

import { FieldEditor } from "../editors/fields/FieldEditor.jsx";
import { ListEditor } from "../editors/fields/ListEditor.jsx";
import { useCollectionEditor } from "../collections/hooks/use-collection-editor.js";
import { CollectionRecordForm } from "./CollectionRecordForm.jsx";
import { BlockConflictNotice, CONFLICT_TRANSITION } from "./BlockConflictNotice.jsx";
import { blockResetStyle, dirtyDotStyle, rowContainerStyle, rowHeaderStyle, rowGuideBodyStyle, rowPathStyle, typeIconStyle, groupIconStyle } from "./drawer-styles.js";
import { TEXT_MID, TEXT_MUTED, TEXT_FAINT, COLLECTION_ACCENT, HAIRLINE, FONT_SANS, FONT_MONO, R_MD, TYPE_META, TYPE_META_FALLBACK } from "../shared/style/tokens.js";

// Field-weight types: a single light editor, rendered always-open as a form
// field. Everything else (RichText/Image/List/Collection/unknown) keeps the
// collapsible card surface.
const INLINE_TYPES = new Set(["ShortText", "LongText", "Date", "Link"]);

/**
 * @param {React.CSSProperties} base
 * @param {boolean} topLevel
 */
function rowInsetStyle(base, topLevel) {
  return topLevel
    ? { ...base, paddingLeft: 6 }
    : { ...base, marginLeft: 6, paddingLeft: 6 };
}

/**
 * @import { BlockResponse, BlockType, ItemSchema } from "../shared/contracts/schemas.js"
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
    const binding = /** @type {{ collection?: string, slug?: string }} */ (
      props.block.value ?? {}
    );
    if (typeof binding.collection !== "string" || typeof binding.slug !== "string") {
      return (
        <InvalidCollectionCard
          block={props.block}
          topLevel={props.topLevel}
          displayPath={props.displayPath}
        />
      );
    }
    return (
      <CollectionBlockCard
        block={props.block}
        collection={binding.collection}
        slug={binding.slug}
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
          <span style={dirtyDotStyle} aria-label="Kaydedilmemiş değişiklik" />
        ) : null}
        {isDirty ? (
          <button
            type="button"
            onClick={onReset}
            className="inscribed-icon-button"
            style={blockResetStyle}
            aria-label="Bu bloğun değişikliklerini geri al"
            title="Geri al"
          >
            <Undo2 size={13} />
          </button>
        ) : null}
        {readOnly ? (
          <span
            style={{ display: "inline-flex", color: TEXT_MUTED }}
            title="Salt okunur (editable={false})"
            aria-label="Salt okunur"
          >
            <Lock size={12} />
          </span>
        ) : null}
      </div>
      {/* `layout` here, not on the panel: the conflict panel appearing is a
          size change of this box, and letting the projection animate it is what
          slides the editor down instead of measuring an auto height. */}
      <motion.div layout style={fieldEditorWrapStyle} transition={CONFLICT_TRANSITION}>
        <BlockConflictNotice
          show={hasConflict}
          block={block}
          draft={value}
          onTakeTheirs={onTakeTheirs}
          onKeepMine={onKeepMine}
        />
        {/* Its own `layout` too: the wrapper's animates the box, but a plain
            child inside it just reflows, which is the editor snapping up the
            frame the panel unmounts instead of travelling with it. */}
        <motion.div layout style={editorSlotStyle} transition={CONFLICT_TRANSITION}>
          <FieldEditor
            blockType={block.blockType}
            value={value}
            onChange={onChange}
            disabled={readOnly}
            hideLabel
          />
        </motion.div>
      </motion.div>
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

const fieldPathStyle = rowPathStyle;

// Disclosure rows (heavy blocks): the shared row shell, with a clickable header
// instead of an always-open editor. Only the pointer affordance is local; the
// geometry lives in the styles module so the changes preview matches it.
const disclosureRowStyle = rowContainerStyle;

const disclosureHeaderStyle = /** @type {React.CSSProperties} */ ({
  ...rowHeaderStyle,
  cursor: "pointer",
  userSelect: "none",
});

const disclosureBodyStyle = rowGuideBodyStyle;

/**
 * Card for a Collection block whose `value` is missing `{ collection, slug }`.
 * Separate from `CollectionBlockCard` so `useCollectionEditor` only runs with a
 * valid pair.
 *
 * @param {{ block: BlockResponse, topLevel: boolean, displayPath?: string }} props
 */
function InvalidCollectionCard({ block, topLevel, displayPath }) {
  return (
    <div
      className="inscribed-field-row inscribed-field-row-collection"
      style={rowInsetStyle(disclosureRowStyle, topLevel)}
    >
      <div style={{ ...disclosureHeaderStyle, cursor: "default" }}>
        <TypeIcon type={block.blockType} compact={topLevel} />
        <span style={fieldPathStyle} title={block.blockPath}>
          {displayPath ?? block.blockPath}
        </span>
      </div>
      <div style={disclosureBodyStyle}>
        <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
          Bu Collection bloğu geçersiz bir bağlamaya sahip — beklenen{" "}
          <code>{`{ collection, slug }`}</code> şeklini taşımıyor.
        </div>
      </div>
    </div>
  );
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
function RegularBlockCard({ block, isActive, itemSchema, readOnly, topLevel, displayPath }) {
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
        preview={blockPreview(block.blockType, value)}
        onHeaderClick={handleHeaderClick}
        onReset={onReset}
      />
      <div
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <motion.div layout style={disclosureBodyStyle} transition={CONFLICT_TRANSITION}>
          <BlockConflictNotice
            show={hasConflict}
            block={block}
            draft={value}
            onTakeTheirs={onTakeTheirs}
            onKeepMine={onKeepMine}
          />
          <motion.div layout style={editorSlotStyle} transition={CONFLICT_TRANSITION}>
            {renderEditor(block, value, onChange, itemSchema, readOnly)}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Collection block lane: owns the editor's draft state so the header can render
 * the "Geri al" reset next to the chevron.
 *
 * @param {{
 *   block: BlockResponse,
 *   collection: string,
 *   slug: string,
 *   isActive: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 * }} props
 */
function CollectionBlockCard({ block, collection, slug, isActive, readOnly, topLevel, displayPath }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const { setActiveBlock, uiStore } = useCmsContext();
  const isDrawerOpen = useStoreSelector(uiStore, (s) => s.isDrawerOpen);
  // The page's own `<CollectionField>`s drive the draft when they exist; this
  // card then shows the same values without a second autosave loop behind them.
  const [isOpen, setIsOpen] = useState(false);
  // Nobody is looking at a collapsed card behind a shut panel, so it stops
  // re-seeding on every keystroke until it comes back into view.
  const role = useDrawerDraftRole(collection, slug, isDrawerOpen && isOpen);
  const editor = useCollectionEditor(collection, slug, role);
  // A locked card surfaces no dirty state, same as a readOnly block row.
  const isDirty = !readOnly && editor.hasDraft && editor.canEdit;

  const onFocus = useCallback(
    () => setActiveBlock(block.blockPath),
    [setActiveBlock, block.blockPath],
  );

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) onFocus();
  };

  const record = `${collection} · ${slug}`;

  return (
    <div
      ref={ref}
      className={rowClassName({ isActive, isCollection: true })}
      style={rowInsetStyle(disclosureRowStyle, topLevel)}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        isCollection
        topLevel={topLevel}
        displayPath={displayPath}
        preview={displayPath === record ? null : record}
        onHeaderClick={handleHeaderClick}
        onReset={editor.undoDraft}
      />
      <div
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={disclosureBodyStyle}>
          <CollectionRecordForm editor={editor} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

/**
 * Row class string: shares the form-row base (active ring) with `FieldRow`;
 * the collection variant swaps the ring tone. Dirty state travels on the
 * header dot, not the container.
 *
 * @param {{ isActive: boolean, isCollection: boolean }} args
 */
function rowClassName({ isActive, isCollection }) {
  const parts = ["inscribed-field-row"];
  if (isCollection) parts.push("inscribed-field-row-collection");
  if (isActive) parts.push("is-active");
  return parts.join(" ");
}

/**
 * Shared header row for both lanes. Clicking it toggles the body; the reset
 * button (only when dirty) stops propagation so undo doesn't also toggle.
 * `preview` (a one-line value summary) shows only while closed, so a shut
 * card still tells what's inside.
 *
 * @param {{
 *   block: BlockResponse,
 *   isOpen: boolean,
 *   isDirty: boolean,
 *   isCollection?: boolean,
 *   readOnly?: boolean,
 *   preview?: string | null,
 *   topLevel: boolean,
 *   displayPath?: string,
 *   onHeaderClick: () => void,
 *   onReset: () => void,
 * }} props
 */
function CardHeader({ block, isOpen, isDirty, isCollection, readOnly, preview, topLevel, displayPath, onHeaderClick, onReset }) {
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      className="inscribed-disclosure-header"
      style={disclosureHeaderStyle}
    >
      <TypeIcon type={block.blockType} compact={topLevel} />
      <span className="inscribed-row-label" style={{ ...fieldPathStyle, color: undefined }} title={block.blockPath}>
        {displayPath ?? block.blockPath}
      </span>

      {!isOpen && preview ? (
        <span style={cardPreviewStyle} title={preview}>{preview}</span>
      ) : null}

      {isDirty ? (
        <span
          style={isCollection ? { ...dirtyDotStyle, background: COLLECTION_ACCENT, boxShadow: `0 0 5px ${COLLECTION_ACCENT}80` } : dirtyDotStyle}
          aria-label="Kaydedilmemiş değişiklik"
        />
      ) : null}

      {isDirty ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onReset();
            }
          }}
          className={`inscribed-icon-button${isCollection ? " inscribed-icon-button-collection" : ""}`}
          style={blockResetStyle}
          aria-label="Bu bloğun değişikliklerini geri al"
          title="Geri al"
        >
          <Undo2 size={13} />
        </span>
      ) : null}

      {readOnly ? (
        <span
          style={{ display: "inline-flex", color: TEXT_MUTED }}
          title="Salt okunur (editable={false})"
          aria-label="Salt okunur"
        >
          <Lock size={12} />
        </span>
      ) : null}

      <span
        className="inscribed-row-chevron"
        style={{
          display: "inline-flex",
          transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1), color 140ms ease",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        <ChevronDown size={13} />
      </span>
    </button>
  );
}

const cardPreviewStyle = /** @type {React.CSSProperties} */ ({
  flex: "0 1 auto",
  minWidth: 0,
  maxWidth: "45%",
  font: `11px/1.2 ${FONT_SANS}`,
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/**
 * One-line value summary for a closed heavy card. Returns null when there is
 * nothing meaningful to show (the header then stays as-is).
 *
 * @param {string} blockType
 * @param {*} value
 * @returns {string | null}
 */
function blockPreview(blockType, value) {
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
      return Array.isArray(value) ? `${value.length} öğe` : null;
    default:
      return null;
  }
}

/**
 * Block-type glyph badge (Aa for Text, ¶ for Rich, etc.), the cue admins scan
 * the list by. Monochrome on purpose: every row carries one, so per-type
 * colours would turn the form into confetti; the glyph shape alone does the
 * telling.
 *
 * @param {{ type: BlockType, compact?: boolean }} props
 */
// Types whose glyph reads poorly when centered get a real SVG icon instead.
const TYPE_ICON_OVERRIDES = { List: ListIcon };

function TypeIcon({ type, compact }) {
  const meta = TYPE_META[type] ?? TYPE_META_FALLBACK;
  const Override = TYPE_ICON_OVERRIDES[type];
  return (
    <span
      aria-hidden="true"
      style={compact ? { ...groupIconStyle, font: typeIconStyle.font } : {
        ...typeIconStyle,
        color: TEXT_MUTED,
      }}
    >
      {Override ? <Override size={12} /> : meta.glyph}
    </span>
  );
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
function renderEditor(block, value, onChange, itemSchema, readOnly) {
  if (block.blockType === "List") {
    return <ListEditor blockPath={block.blockPath} value={value} onChange={onChange} itemSchema={itemSchema} disabled={readOnly} />;
  }
  const primitive = FieldEditor({ blockType: block.blockType, value, onChange, disabled: readOnly });
  if (primitive) return primitive;
  return (
    <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
      <code>{block.blockType}</code> tipi için inline editör henüz yok.
    </div>
  );
}