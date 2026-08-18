"use client";

/**
 * @file The drawer's Collection card lane, split off `BlockCard` so it loads
 * behind `next/dynamic`. It is the only part of the drawer that reaches into
 * the collections layer, so an admin on a site without collections never
 * downloads that graph (`useCollectionEditor` pulls the record cache, the
 * schema form and `/me` behind it).
 *
 * Reachable only through a synthesised `blockType: "Collection"` row, which
 * exists only when a page binding registered one, which requires the provider.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";
import { useCollectionEditor } from "../collections/hooks/use-collection-editor.js";
import { CollectionRecordForm } from "./CollectionRecordForm.jsx";
import { CardHeader, TypeIcon, disclosureBodyStyle, disclosureHeaderStyle, disclosureRowStyle, fieldPathStyle, rowClassName, rowInsetStyle } from "./block-card-chrome.jsx";
import { TEXT_MUTED } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Entry point for the lane: validates the binding before anything reads it, so
 * `useCollectionEditor` only ever runs with a real (collection, slug) pair.
 *
 * @param {{
 *   block: BlockResponse,
 *   isActive: boolean,
 *   readOnly?: boolean,
 *   topLevel: boolean,
 *   displayPath?: string,
 * }} props
 */
export function CollectionLane({ block, isActive, readOnly, topLevel, displayPath }) {
  const binding = /** @type {{ collection?: string, slug?: string }} */ (block.value ?? {});
  if (typeof binding.collection !== "string" || typeof binding.slug !== "string") {
    return <InvalidCollectionCard block={block} topLevel={topLevel} displayPath={displayPath} />;
  }
  return (
    <CollectionBlockCard
      block={block}
      collection={binding.collection}
      slug={binding.slug}
      isActive={isActive}
      readOnly={readOnly}
      topLevel={topLevel}
      displayPath={displayPath}
    />
  );
}

/**
 * Card for a Collection block whose `value` is missing `{ collection, slug }`.
 *
 * @param {{ block: BlockResponse, topLevel: boolean, displayPath?: string }} props
 */
function InvalidCollectionCard({ block, topLevel, displayPath }) {
  const t = useCmsStrings();
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
          {t("block.invalidCollection", { shape: "{ collection, slug }" })}
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
 *   readOnly?: boolean,
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
