"use client";

/**
 * @file The drawer's Collection card lane, split off `BlockCard` so it loads
 * behind `next/dynamic`. It is the drawer's only reach into the collections
 * layer, so a site without collections never downloads that graph.
 *
 * On a collection that holds several languages the card also carries the
 * record's other languages (see `RecordTranslations`), and its save publishes
 * the ones written from here along with the record.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useInert } from "../shared/ui/use-inert.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { localeCodes } from "../shared/util/locale-codes.js";
import { useCollectionContext } from "../collections/context.js";
import { useCollectionMeta } from "../collections/hooks/use-my-collections.js";
import { useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";
import { useCollectionEditor, useEditorDirty } from "../collections/hooks/use-collection-editor.js";
import { CollectionRecordForm } from "./CollectionRecordForm.jsx";
import { RecordTranslations, hasTyped, newTranslationKey } from "./RecordTranslations.jsx";
import { CardHeader, TypeIcon, cardTextColStyle, disclosureBodyStyle, disclosureHeaderStyle, disclosureRowStyle, fieldPathStyle, rowClassName, rowInsetStyle, rowTone } from "./block-card-chrome.jsx";
import { TEXT_MUTED } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Validates the binding first, so `useCollectionEditor` only ever runs with a
 * real (collection, slug) pair.
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

/** @param {{ block: BlockResponse, topLevel: boolean, displayPath?: string }} props */
function InvalidCollectionCard({ block, topLevel, displayPath }) {
  const t = useCmsStrings();
  return (
    <div
      className="inscribed-field-row inscribed-field-row-collection"
      style={rowInsetStyle(disclosureRowStyle, topLevel)}
    >
      <div style={{ ...disclosureHeaderStyle, cursor: "default" }}>
        <TypeIcon type={block.blockType} compact={topLevel} tone={rowTone({ isCollection: true })} />
        <span style={cardTextColStyle}>
          <span className="inscribed-row-label" style={fieldPathStyle} title={block.blockPath}>
            {displayPath ?? block.blockPath}
          </span>
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
  const ownPending = useEditorDirty(editor) || editor.isVirtual;

  const t = useCmsStrings();
  const { collectionStore } = useCollectionContext();
  const meta = useCollectionMeta(collection);
  const item = editor.item;
  const others = (meta?.locales ?? []).filter((l) => l !== item?.locale);
  const canTranslate = !readOnly && editor.canEdit && !editor.isVirtual
    && item?.locale != null && others.length > 0;
  const [translating, setTranslating] = useState(false);

  // Each other language with something for the next publish, in the order
  // it registered. A ref for the publish itself, a list for the label.
  const entriesRef = useRef(/** @type {Map<string, import("./RecordTranslations.jsx").TranslationEntry>} */ (new Map()));
  const [pendingLocales, setPendingLocales] = useState(/** @type {string[]} */ ([]));
  const register = useCallback(
    /** @param {string} locale @param {import("./RecordTranslations.jsx").TranslationEntry | null} entry */
    (locale, entry) => {
      if (entry) entriesRef.current.set(locale, entry);
      else entriesRef.current.delete(locale);
      const next = [...entriesRef.current.keys()];
      setPendingLocales((prev) => (prev.length === next.length && prev.every((l, i) => l === next[i]) ? prev : next));
    },
    [],
  );
  // Typed for a record that does not exist yet, left from before a navigation:
  // the panel opens on it, since that is the only place it can be sent from.
  const typedWaiting = useStoreSelector(
    collectionStore,
    (s) => others.some((l) => hasTyped(s.editorValues.get(newTranslationKey(collection, slug, l)))),
  );
  // Open while anything in it is waiting to go out, so nothing unsent is ever
  // out of sight.
  const holdsWork = pendingLocales.length > 0 || typedWaiting;
  const showTranslations = canTranslate && (translating || holdsWork);

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const readSource = useCallback(() => editorRef.current.readValues(), []);

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(/** @type {{ failed: string[], notice: string } | null} */ (null));
  useEffect(() => {
    if (outcome && pendingLocales.length === 0) setOutcome(null);
  }, [outcome, pendingLocales.length]);

  const publishAll = async () => {
    setOutcome(null);
    const waiting = [...entriesRef.current];
    // Everything is checked before anything goes out: a record published
    // without the translation that failed its check is the half-done state a
    // single button is meant to spare the editor.
    for (const [, entry] of waiting) {
      const refusal = entry.validate();
      if (refusal) {
        setOutcome({ failed: [], notice: refusal });
        return;
      }
    }
    setBusy(true);
    /** @type {string[]} */
    const done = [];
    /** @type {string[]} */
    const failed = [];
    /** @type {string | null} */
    let reason = null;
    if (ownPending) {
      // Refused here, it says why in the form, and nothing else is sent.
      if (await editorRef.current.save()) {
        setBusy(false);
        return;
      }
      if (item?.locale) done.push(item.locale);
    }
    for (const [locale, entry] of waiting) {
      const refusal = await entry.publish();
      if (refusal) {
        failed.push(locale);
        reason ??= refusal;
      } else {
        done.push(locale);
      }
    }
    setBusy(false);
    if (failed.length === 0) return;
    setOutcome({
      failed,
      notice: done.length > 0
        ? t("saveError.partial", { published: localeCodes(done), failed: localeCodes(failed), reason })
        : t("collections.localeFailed", { locale: localeCodes(failed), reason }),
    });
  };

  const order = meta?.locales ?? [];
  const reach = [
    ...(ownPending && item?.locale ? [item.locale] : []),
    ...order.filter((l) => pendingLocales.includes(l)),
  ];
  const retrying = Boolean(outcome?.failed.length) && outcome.failed.every((l) => pendingLocales.includes(l));
  const label = reach.some((l) => l !== item?.locale)
    ? t(retrying ? "status.retryLocales" : "status.saveLocales", { locales: localeCodes(reach) })
    : t("status.save");

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
  const bodyRef = useInert(!isOpen);

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
        translating={showTranslations}
        onTranslate={canTranslate ? () => {
          // The languages live in the body, so asking for them opens a shut card.
          if (!showTranslations) setIsOpen(true);
          setTranslating(!showTranslations);
        } : undefined}
      />
      <div
        ref={bodyRef}
        className={`inscribed-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={disclosureBodyStyle}>
          <CollectionRecordForm
            editor={editor}
            readOnly={readOnly}
            publish={canTranslate ? {
              label,
              onPublish: publishAll,
              pending: pendingLocales.length > 0,
              busy,
              notice: outcome?.notice ?? null,
            } : undefined}
          >
            {canTranslate && item ? (
              <RecordTranslations
                collection={collection}
                item={item}
                readSource={readSource}
                show={showTranslations}
                canClose={!holdsWork}
                onClose={() => setTranslating(false)}
                visible={isDrawerOpen && isOpen}
                register={register}
              />
            ) : null}
          </CollectionRecordForm>
        </div>
      </div>
    </div>
  );
}
