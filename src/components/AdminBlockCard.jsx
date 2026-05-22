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
  // Editor renders the local draft if mid-edit, else the backend-side
  // overlay (`block.draftValue`), else the published value.
  const effective = block.draftValue ?? block.value;
  const value = hasDraft ? draft : effective;
  // "Dirty" = anything in this block diverges from `block.value` (the
  // published version). Covers both local edits and server-side drafts.
  const isDirty = hasDraft
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

  return (
    <div
      ref={ref}
      className={isActive ? "skylab-cms-block-card skylab-cms-block-card-active" : "skylab-cms-block-card"}
      style={blockCardStyle}
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
  if (block.blockType === "List") {
    return <ListEditor value={value} onChange={onChange} itemSchema={itemSchema} />;
  }
  const primitive = FieldEditor({ blockType: block.blockType, value, onChange });
  if (primitive) return primitive;
  // DataSource and anything else the SDK doesn't know how to edit inline.
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