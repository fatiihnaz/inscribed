"use client";

/**
 * @file `BlockCard` - one inline-editable block row inside the admin
 * drawer's block list.
 *
 * Header is always rendered (block path + type chip + per-block reset
 * button when dirty); the body (the type-specific editor wired to the
 * block's draft) collapses/expands on click and auto-opens when the
 * matching `<EditableRegion>` on the page is focused.
 *
 * "Dirty" is computed against `block.value` (published) so both local
 * draft edits and server-side `block.draftValue` overlays show the
 * undo affordance.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Undo2 } from "lucide-react";

import { stableStringify } from "../lib/stable-stringify.js";

import { FieldEditor } from "./editors/FieldEditor.jsx";
import { ListEditor } from "./editors/ListEditor.jsx";
import { AdminCollectionItemCard } from "./AdminCollectionItemCard.jsx";
import {
  TEXT_MUTED,
  TYPE_STYLES,
  blockCardStyle,
  blockHeaderStyle,
  gripStyle,
  gripDotStyle,
  blockPathStyle,
  blockBodyStyle,
  blockResetStyle,
  typeChipStyle,
  COLLECTION_CARD_BORDER,
  COLLECTION_CARD_ACTIVE_BORDER,
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
 * }} props
 */
export function BlockCard({ block, draft, hasDraft, isActive, onChange, onReset, onFocus, itemSchema }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  // Collection blocks live in a separate save lane (direct PUT against
  // /cms/collections/{key}/{slug}, no CMS draft system) so the regular
  // dirty/undo machinery doesn't apply to them. The card still renders
  // a header + body so admins can find and edit them; the body just
  // delegates to AdminCollectionItemCard which owns its own save state.
  const isCollection = block.blockType === "Collection";

  // Editor renders the local draft if mid-edit, else the backend-side
  // overlay (`block.draftValue`), else the published value.
  const effective = block.draftValue ?? block.value;
  const value = hasDraft ? draft : effective;
  // "Dirty" = anything in this block diverges from `block.value` (the
  // published version). Covers both local edits and server-side drafts.
  // Collection blocks bypass this entirely (see comment above).
  const isDirty = isCollection
    ? false
    : hasDraft
      ? stableStringify(draft) !== stableStringify(block.value)
      : block.draftValue != null;

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsOpen(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      onFocus();
    }
  };

  const cardStyle = isCollection
    ? {
        ...blockCardStyle,
        border: isActive ? COLLECTION_CARD_ACTIVE_BORDER : COLLECTION_CARD_BORDER,
      }
    : blockCardStyle;

  return (
    <div
      ref={ref}
      className={isActive ? "skylab-cms-block-card skylab-cms-block-card-active" : "skylab-cms-block-card"}
      style={cardStyle}
    >
      <div
        style={{ ...blockHeaderStyle, cursor: "pointer", userSelect: "none" }}
        onClick={handleHeaderClick}
      >
        <span style={gripStyle} aria-hidden="true">
          <span style={gripDotStyle} /><span style={gripDotStyle} />
          <span style={gripDotStyle} /><span style={gripDotStyle} />
          <span style={gripDotStyle} /><span style={gripDotStyle} />
        </span>
        <span style={blockPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>

        {isDirty ? (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            className="skylab-cms-icon-button"
            style={blockResetStyle}
            aria-label="Bu bloğun değişikliklerini geri al"
            title="Geri al"
          >
            <Undo2 size={13} />
          </button>
        ) : null}

        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED }}
        >
          <ChevronDown size={14} />
        </motion.span>
        <TypeChip type={block.blockType} />
      </div>

      {isCollection ? (
        // Collection bodies stay mounted across collapse so the inner
        // AdminCollectionItemCard's useCollectionItem hook doesn't
        // re-fire its fetch every time the card is reopened. We trade
        // the framer-motion height animation for instant show/hide.
        <div
          style={{ display: isOpen ? "block" : "none" }}
          onMouseDown={onFocus}
        >
          <div style={blockBodyStyle}>
            {renderEditor(block, value, onChange, itemSchema)}
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
              style={{ overflow: "hidden" }}
              onMouseDown={onFocus}
            >
              <div style={blockBodyStyle}>
                {renderEditor(block, value, onChange, itemSchema)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

/**
 * Per-block undo. When a server-side draft exists, clearing the local
 * entry alone wouldn't reach the backend; instead we set the local draft
 * to the published value and let the autosave overwrite the Redis draft
 * (backend then auto-cleans because draft===published). When there's no
 * server-side draft, removing the local entry is enough.
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
 */
function renderEditor(block, value, onChange, itemSchema) {
  if (block.blockType === "Collection") {
    // Collection blocks have their own fetch + save lane; ignore the
    // draft-aware value/onChange the rest of the system uses.
    return <AdminCollectionItemCard block={block} />;
  }
  if (block.blockType === "List") {
    return <ListEditor value={value} onChange={onChange} itemSchema={itemSchema} />;
  }
  const primitive = FieldEditor({ blockType: block.blockType, value, onChange });
  if (primitive) return primitive;
  // Anything else the SDK doesn't know how to edit inline.
  return (
    <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
      <code>{block.blockType}</code> tipi için inline editör henüz yok.
    </div>
  );
}

/** @param {{ type: BlockType }} props */
function TypeChip({ type }) {
  const styles = TYPE_STYLES[type] ?? TYPE_STYLES.Text;

  return (
    <span style={typeChipStyle}>
      {styles.label}
    </span>
  );
}