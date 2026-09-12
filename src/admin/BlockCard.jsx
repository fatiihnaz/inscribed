"use client";

/**
 * @file One block row in the drawer's block list, weight-dispatched:
 *
 * Every type renders the same `BlockRow`: glyph, mono blockPath, value preview,
 * then the editor behind a disclosure. Weight only picks the resting state —
 * field-weight types (ShortText/Number/Bool/Date/Link/…) start open, heavy ones
 * (RichText/Image/ObjectArray/unknown) start shut — and the drawer's density
 * switch overrides even that.
 *
 * Card header (left to right): TypeIcon badge, mono blockPath, value preview
 * (closed only), then a fixed-width action lane holding Undo (when dirty) and
 * the chevron. State (dirty, locked) is a colour on the badge, not a mark of
 * its own: see `rowTone`. Bodies slide via `.inscribed-collapse`; Collection
 * bodies stay mounted across collapse so the inner `useCollectionItem` fetch
 * isn't replayed on reopen.
 *
 * Collection blocks get a dedicated lane in `CollectionBlockCard.jsx`, loaded
 * lazily: it is the drawer's only reach into the collections layer, so an app
 * without collections leaves that graph unfetched.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useInert } from "../shared/ui/use-inert.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { isBlockDirty, resolveBlockValue } from "../core/resolve.js";

import { FieldEditor } from "../editors/FieldEditor.jsx";
import { FieldMessage } from "../editors/FieldMessage.jsx";
import { ListEditor } from "../editors/ListEditor.jsx";
import { BlockConflictNotice } from "./BlockConflictNotice.jsx";
import { TranslationPrompt } from "./TranslationPrompt.jsx";
import { CardHeader, disclosureBodyStyle, disclosureRowStyle, rowClassName, rowInsetStyle } from "./block-card-chrome.jsx";

const CollectionLane = dynamic(
  () => import("./CollectionBlockCard.jsx").then((m) => m.CollectionLane),
  { ssr: false },
);

// Field-weight types: a single light editor, rendered as an always-open form
// field. Everything else (RichText/Image/ObjectArray/Collection/unknown) opens
// on a disclosure.
//
// This picks the row's default openness, not its shape: both lanes wear the
// same shell now, so a type moving between the two changes when its editor is
// on screen and nothing else.
//
// Listed rather than derived by exclusion so a type this build has never heard
// of still lands on the card lane, where there is a message for it.
const INLINE_TYPES = new Set([
  "ShortText", "LongText", "Number", "Bool", "Url", "Date", "Link", "Select", "StringArray",
]);

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
 * The choices a Select or StringArray block was declared with, or null. These
 * two types draw nothing on the page, so the declaration arrives from
 * `useCmsBlock` metadata rather than from a mounted region; a block whose
 * declaring component is not on this route has none, and the editor says so
 * instead of offering an empty list.
 *
 * @param {string} blockPath
 */
function useChoiceEntry(blockPath) {
  const { registryStore } = useCmsContext();
  return useStoreSelector(registryStore, (s) => s.choiceSources.get(blockPath) ?? null);
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
  return <BlockRow {...props} defaultOpen={INLINE_TYPES.has(props.block.blockType)} />;
});

/**
 * One block row. Both lanes are this component: the weight only decides whether
 * the editor is on screen at rest, and the density switch overrides even that.
 *
 * It used to be two near-copies. `FieldRow` drew its own label line and hung an
 * always-open editor off it, `RegularBlockCard` used `CardHeader` and a
 * disclosure, and the two drifted: only one could be collapsed, only one showed
 * a value preview, and each spaced its body a couple of pixels differently.
 *
 * @param {{
 *   block: BlockResponse,
 *   isActive: boolean,
 *   itemSchema: ItemSchema | null,
 *   readOnly?: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 *   density?: "comfortable" | "compact",
 *   defaultOpen: boolean,
 * }} props
 */
function BlockRow({
  block, isActive, itemSchema, readOnly, topLevel, displayPath, density, defaultOpen,
}) {
  const t = useCmsStrings();
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const {
    draft, hasDraft, hasConflict, onChange, onReset, onFocus, onTakeTheirs, onKeepMine,
  } = useBlockDraft(block);

  const value = resolveBlockValue(block, hasDraft, draft);
  // A read-only block carries no dirty state to surface, so suppress the
  // undo and the accent and let it read as a passive, locked view.
  const isDirty = !readOnly && isBlockDirty(block, hasDraft, draft);
  const choices = useChoiceEntry(block.blockPath);

  const restingOpen = density === "compact" ? false : defaultOpen;
  const [isOpen, setIsOpen] = useState(restingOpen);

  // Density is a page-wide instruction, so it overrides whatever each row was
  // left at. Adjusted during render rather than in an effect: an effect would
  // also fire on mount, and a `setState` there costs every card an extra render
  // per keystroke even though it only ever re-sets the value it already had.
  const [seenDensity, setSeenDensity] = useState(density);
  if (density !== seenDensity) {
    setSeenDensity(density);
    setIsOpen(restingOpen);
  }

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  // A conflict is waiting on a decision that lives in the body, so a shut row
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
        {/* Plain boxes: the notices carry their own height, and the
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
            {renderEditor(block, value, onChange, itemSchema, readOnly, t, choices)}
            {/* The padlock in the gutter says the field is locked; this says
                why, which is the part an editor can act on. */}
            {readOnly ? <FieldMessage>{t("block.readOnlyTitle")}</FieldMessage> : null}
            <TranslationPrompt block={block} value={value} readOnly={readOnly} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Transparent slot whose only job is to give the editor a projected box, so it
// travels when the conflict panel above it comes and goes. Inherits the column
// flow it replaces, so nothing about the editor's own layout changes.
const editorSlotStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

/**
 * One-line value summary for a closed row, which every type can now be: with
 * the density switch on, the preview is the only thing a field shows, so a type
 * with no case here reads as empty when it is full.
 *
 * Returns null when there is genuinely nothing to show; the header then says so
 * in the panel's own voice.
 *
 * @param {string} blockType
 * @param {*} value
 * @param {(key: string, vars?: Record<string, *>) => string} t
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
    case "File": {
      if (!value || typeof value !== "object") return null;
      if (typeof value.name === "string" && value.name) return value.name;
      // The CDN's filename is usually a hash, so it is the fallback rather than
      // the preview: it says a file is there when nobody has titled it.
      if (typeof value.url === "string" && value.url) {
        const clean = value.url.split(/[?#]/)[0];
        return clean.slice(clean.lastIndexOf("/") + 1) || null;
      }
      return null;
    }
    case "ObjectArray":
      return Array.isArray(value) ? t("block.items", { count: value.length }) : null;
    case "Bool":
      // Only a set boolean previews. `null` here means nobody has answered,
      // which is not the same statement as "No".
      return typeof value === "boolean"
        ? t(value ? "editors.bool.on" : "editors.bool.off")
        : null;
    case "Number":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
    case "Link": {
      if (!value || typeof value !== "object") return null;
      // The text a visitor reads comes first; the address is the fallback for a
      // link nobody has titled yet.
      return value.label || value.href || null;
    }
    case "Date": {
      if (typeof value !== "string" || !value) return null;
      const at = new Date(value);
      // An unparseable string is still what the field holds, so it shows rather
      // than reading as empty. A raw ISO stamp is not, which is why a valid one
      // is formatted.
      if (Number.isNaN(at.getTime())) return value;
      return at.toLocaleDateString();
    }
    case "StringArray":
      return Array.isArray(value) && value.length
        ? value.map((x) => (typeof x === "string" ? x : x?.label ?? x?.slug ?? "")).join(" · ")
        : null;
    default:
      // The scalars left (ShortText, LongText, Url, Select) are their own
      // preview.
      return typeof value === "string" && value.trim() ? value : null;
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
 * @param {import("../shared/state/cms-context.js").ChoiceSourceEntry | null} [choices]
 */
function renderEditor(block, value, onChange, itemSchema, readOnly, t, choices) {
  if (block.blockType === "ObjectArray") {
    return <ListEditor blockPath={block.blockPath} value={value} onChange={onChange} itemSchema={itemSchema} disabled={readOnly} />;
  }
  const primitive = FieldEditor({
    blockType: block.blockType,
    value,
    onChange,
    disabled: readOnly,
    source: choices?.source ?? null,
    allowCustom: choices?.allowCustom,
    // The row above already names the field. Without this every heavy card
    // printed a second caption under the mono path, in a different face.
    hideLabel: true,
  });
  if (primitive) return primitive;
  return <FieldMessage tone="warn">{t("block.noEditor", { type: block.blockType })}</FieldMessage>;
}