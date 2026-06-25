"use client";

/**
 * @file `BlockCard`: one inline-editable block row in the drawer's block list.
 *
 * Header (left to right): TypeIcon badge, mono blockPath, (when dirty) sage dot
 * + Undo button, type label, chevron. Body slides via `.inscribed-collapse`;
 * Collection bodies stay mounted across collapse so the inner
 * `useCollectionItem` fetch isn't replayed on reopen.
 *
 * Collection blocks get a dedicated lane: `<CollectionBlockCard>` lifts the
 * editor's draft state so the header can show the "Geri al" reset.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Undo2, Lock, List as ListIcon } from "./icons.jsx";

import { stableStringify } from "../lib/stable-stringify.js";

import { FieldEditor } from "./editors/FieldEditor.jsx";
import { ListEditor } from "./editors/ListEditor.jsx";
import {
  AdminCollectionEditor,
  useCollectionEditor,
} from "./AdminCollectionEditor.jsx";
import {
  TEXT_MUTED,
  COLLECTION_ACCENT,
  TYPE_META,
  blockCardStyle,
  blockHeaderStyle,
  blockPathStyle,
  blockBodyStyle,
  blockResetStyle,
  blockTypeLabelStyle,
  dirtyDotStyle,
  typeIconStyle,
} from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse, BlockType, ItemSchema } from "../lib/schemas.js"
 */

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 * }} props
 */
export function BlockCard(props) {
  if (props.block.blockType === "Collection") {
    const binding = /** @type {{ collection?: string, slug?: string }} */ (
      props.block.value ?? {}
    );
    if (typeof binding.collection !== "string" || typeof binding.slug !== "string") {
      return <InvalidCollectionCard block={props.block} />;
    }
    return (
      <CollectionBlockCard
        block={props.block}
        collection={binding.collection}
        slug={binding.slug}
        isActive={props.isActive}
        onFocus={props.onFocus}
      />
    );
  }
  return <RegularBlockCard {...props} />;
}

/**
 * Card for a Collection block whose `value` is missing `{ collection, slug }`.
 * Separate from `CollectionBlockCard` so `useCollectionEditor` only runs with a
 * valid pair.
 *
 * @param {{ block: BlockResponse }} props
 */
function InvalidCollectionCard({ block }) {
  return (
    <div className="inscribed-block-card" style={blockCardStyle}>
      <div style={blockHeaderStyle}>
        <TypeIcon type={block.blockType} />
        <span style={blockPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>
        <span style={blockTypeLabelStyle}>
          {(TYPE_META[block.blockType] ?? TYPE_META.Text).label}
        </span>
      </div>
      <div style={blockBodyStyle}>
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
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 * }} props
 */
function RegularBlockCard({ block, draft, hasDraft, isActive, onChange, onReset, onFocus, itemSchema, readOnly }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

  const effective = block.draftValue ?? block.value;
  const value = hasDraft ? draft : effective;
  // A read-only block carries no dirty state to surface, so suppress the
  // dot/reset/rail and let it read as a passive, locked view.
  const isDirty = !readOnly && (hasDraft
    ? stableStringify(draft) !== stableStringify(block.value)
    : block.draftValue != null);

  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <div
      ref={ref}
      className={cardClassName({ isActive, isDirty, isCollection: false })}
      style={blockCardStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        readOnly={readOnly}
        onHeaderClick={handleHeaderClick}
        onReset={onReset}
      />
      <div
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={blockBodyStyle}>
          {renderEditor(block, value, onChange, itemSchema, readOnly)}
        </div>
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
 *   onFocus: () => void,
 * }} props
 */
function CollectionBlockCard({ block, collection, slug, isActive, onFocus }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const editor = useCollectionEditor(collection, slug);
  const isDirty = editor.hasDraft && editor.canEdit;

  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <div
      ref={ref}
      className={cardClassName({ isActive, isDirty, isCollection: true })}
      style={blockCardStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        isCollection
        onHeaderClick={handleHeaderClick}
        onReset={editor.undoDraft}
      />
      <div
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={blockBodyStyle}>
          <AdminCollectionEditor editor={editor} />
        </div>
      </div>
    </div>
  );
}

/**
 * Compose the card's class string from its state. Active adds the lane accent
 * (sage / pink-purple); dirty layers a thin sage rail on the base border.
 *
 * @param {{ isActive: boolean, isDirty: boolean, isCollection: boolean }} args
 */
function cardClassName({ isActive, isDirty, isCollection }) {
  const parts = ["inscribed-block-card"];
  if (isCollection) parts.push("inscribed-block-card-collection");
  if (isDirty) parts.push("is-dirty");
  if (isActive) parts.push(isCollection ? "inscribed-block-card-collection-active" : "inscribed-block-card-active");
  return parts.join(" ");
}

/**
 * Shared header row for both lanes. Clicking it toggles the body; the reset
 * button (only when dirty) stops propagation so undo doesn't also toggle.
 *
 * @param {{
 *   block: BlockResponse,
 *   isOpen: boolean,
 *   isDirty: boolean,
 *   isCollection?: boolean,
 *   readOnly?: boolean,
 *   onHeaderClick: () => void,
 *   onReset: () => void,
 * }} props
 */
function CardHeader({ block, isOpen, isDirty, isCollection, readOnly, onHeaderClick, onReset }) {
  const meta = TYPE_META[block.blockType] ?? TYPE_META.Text;
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      style={{
        ...blockHeaderStyle,
        width: "100%",
        cursor: "pointer",
        userSelect: "none",
        textAlign: "left",
        fontFamily: "inherit",
        color: "inherit",
      }}
    >
      <TypeIcon type={block.blockType} />
      <span style={blockPathStyle} title={block.blockPath}>
        {block.blockPath}
      </span>

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

      <span style={blockTypeLabelStyle}>{meta.label}</span>

      <span
        style={{
          display: "inline-flex",
          color: TEXT_MUTED,
          transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1)",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        <ChevronDown size={13} />
      </span>
    </button>
  );
}

/**
 * Block-type glyph badge in the type's tone (Aa for Text, ¶ for Rich, etc.),
 * the cue admins scan the list by.
 *
 * @param {{ type: BlockType }} props
 */
// Types whose glyph reads poorly when centered get a real SVG icon instead.
const TYPE_ICON_OVERRIDES = { List: ListIcon };

function TypeIcon({ type }) {
  const meta = TYPE_META[type] ?? TYPE_META.Text;
  const Override = TYPE_ICON_OVERRIDES[type];
  return (
    <span
      aria-hidden="true"
      style={{
        ...typeIconStyle,
        color: meta.color,
      }}
    >
      {Override ? <Override size={13} /> : meta.glyph}
    </span>
  );
}

/**
 * Per-block undo. With a server-side draft, clearing the local entry wouldn't
 * reach the backend, so set the local draft to the published value and let
 * autosave overwrite the Redis draft (the backend auto-cleans on
 * draft===published). Without one, removing the local entry is enough.
 *
 * @param {BlockResponse} block
 * @param {(blockPath: string, value: *) => void} setDraft
 * @param {(blockPath: string) => void} clearDraft
 */
export function resetBlock(block, setDraft, clearDraft) {
  if (block.draftValue != null) {
    setDraft(block.blockPath, block.value);
  } else {
    clearDraft(block.blockPath);
  }
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