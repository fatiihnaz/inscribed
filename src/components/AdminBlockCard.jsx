"use client";

/**
 * @file One block row in the drawer's block list, weight-dispatched:
 *
 * Field-weight types (ShortText/Text/LongText/Date/Link) render as
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
  TEXT_MID,
  TEXT_MUTED,
  TEXT_FAINT,
  COLLECTION_ACCENT,
  HAIRLINE,
  FONT_SANS,
  FONT_MONO,
  R_MD,
  TYPE_META,
  blockResetStyle,
  dirtyDotStyle,
  typeIconStyle,
} from "./admin-drawer-styles.js";

// Field-weight types: a single light editor, rendered always-open as a form
// field. Everything else (RichText/Image/List/Collection/unknown) keeps the
// collapsible card surface.
const INLINE_TYPES = new Set(["ShortText", "Text", "LongText", "Date", "Link"]);

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
 *   displayPath?: string,
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
        displayPath={props.displayPath}
      />
    );
  }
  if (INLINE_TYPES.has(props.block.blockType)) {
    return <FieldRow {...props} />;
  }
  return <RegularBlockCard {...props} />;
}

/**
 * Always-open form field for field-weight blocks: mono path label on top
 * (dirty dot + undo + lock live on the label row), the editor below. Active
 * state (page region clicked) scrolls into view and lights the left rail via
 * `.is-active`.
 *
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   readOnly?: boolean,
 *   displayPath?: string,
 * }} props
 */
function FieldRow({ block, draft, hasDraft, isActive, onChange, onReset, onFocus, readOnly, displayPath }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

  const effective = block.draftValue ?? block.value;
  const value = hasDraft ? draft : effective;
  const isDirty = !readOnly && (hasDraft
    ? stableStringify(draft) !== stableStringify(block.value)
    : block.draftValue != null);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      className={`inscribed-field-row${isActive ? " is-active" : ""}`}
      style={fieldRowStyle}
      onMouseDown={onFocus}
    >
      <div style={fieldLabelRowStyle}>
        <TypeIcon type={block.blockType} />
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
      <div style={fieldEditorWrapStyle}>
        <FieldEditor
          blockType={block.blockType}
          value={value}
          onChange={onChange}
          disabled={readOnly}
          hideLabel
        />
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

const fieldPathStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  font: `500 11px/1.2 ${FONT_MONO}`,
  color: TEXT_MID,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Disclosure rows (heavy blocks): the same form-row shell as FieldRow, with a
// clickable header instead of an always-open editor.
const disclosureRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  padding: "6px 12px 6px",
  borderRadius: R_MD,
});

const disclosureHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 22,
  padding: 0,
  background: "transparent",
  border: 0,
  cursor: "pointer",
  userSelect: "none",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
});

// Open body: indented under the header with a hairline guide instead of a
// boxed card, so the block keeps reading as part of the form flow.
const disclosureBodyStyle = /** @type {React.CSSProperties} */ ({
  margin: "4px 0 4px 9px",
  padding: "4px 0 6px 14px",
  borderLeft: `1px solid ${HAIRLINE}`,
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

/**
 * Card for a Collection block whose `value` is missing `{ collection, slug }`.
 * Separate from `CollectionBlockCard` so `useCollectionEditor` only runs with a
 * valid pair.
 *
 * @param {{ block: BlockResponse }} props
 */
function InvalidCollectionCard({ block }) {
  return (
    <div className="inscribed-field-row inscribed-field-row-collection" style={disclosureRowStyle}>
      <div style={{ ...disclosureHeaderStyle, cursor: "default" }}>
        <TypeIcon type={block.blockType} />
        <span style={fieldPathStyle} title={block.blockPath}>
          {block.blockPath}
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
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 *   displayPath?: string,
 * }} props
 */
function RegularBlockCard({ block, draft, hasDraft, isActive, onChange, onReset, onFocus, itemSchema, readOnly, displayPath }) {
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
      className={rowClassName({ isActive, isCollection: false })}
      style={disclosureRowStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        readOnly={readOnly}
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
        <div style={disclosureBodyStyle}>
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
 *   displayPath?: string,
 * }} props
 */
function CollectionBlockCard({ block, collection, slug, isActive, onFocus, displayPath }) {
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
      className={rowClassName({ isActive, isCollection: true })}
      style={disclosureRowStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        isCollection
        displayPath={displayPath}
        preview={`${collection} · ${slug}`}
        onHeaderClick={handleHeaderClick}
        onReset={editor.undoDraft}
      />
      <div
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={disclosureBodyStyle}>
          <AdminCollectionEditor editor={editor} />
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
 *   displayPath?: string,
 *   onHeaderClick: () => void,
 *   onReset: () => void,
 * }} props
 */
function CardHeader({ block, isOpen, isDirty, isCollection, readOnly, preview, displayPath, onHeaderClick, onReset }) {
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      className="inscribed-disclosure-header"
      style={disclosureHeaderStyle}
    >
      <TypeIcon type={block.blockType} />
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
        color: TEXT_MUTED,
      }}
    >
      {Override ? <Override size={12} /> : meta.glyph}
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