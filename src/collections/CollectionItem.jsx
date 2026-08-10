"use client";

/**
 * @file `<CollectionItem>`: one collection record, rendered by element children.
 *
 * Public visitors get the children as-is. Admins with `item.canEdit` also get a
 * click-to-focus wrapper (like EditableRegion) that opens the matching drawer
 * card, plus publish/revert on the ring once the page carries fields.
 *
 *   <CollectionItem collection="news" slug="q1-release-notes">
 *     <article>
 *       <CollectionField name="title" as="h1" />
 *       <CollectionField name="body" as="div" html />
 *     </article>
 *   </CollectionItem>
 *
 * Children are elements, not a function, so the same markup works from a Server
 * Component: `createCmsPage` returns a server `<CollectionItem>` that awaits the
 * record and hands it to `<CollectionRecord>` below. Markup that has to compute
 * with the record (a link built from the slug) reads it through
 * `useCollectionRecord()` in a small client component of its own.
 *
 * The binding identifies itself by the record it points at, so rendering the
 * same item twice on a page yields one drawer card, not two.
 */

import { isValidElement, useContext, useEffect, useId, useMemo, useState } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { collectionItemBindingId, useCollectionContext } from "./context.js";
import { CollectionItemContext } from "./item-context.js";
import { CmsGroupContext, CmsGroupVisibilityContext } from "../shared/state/group-context.js";
import { useCollectionItem } from "./hooks/use-collection.js";
import { useStoreSelector } from "../shared/state/store.js";
import { useRecordDraftRole } from "./hooks/use-draft-driver.js";
import { useCollectionEditor } from "./hooks/use-collection-editor.js";
import { COLLECTION_ACCENT, FONT_MONO, STATUS_DANGER, STATUS_OK, TEXT_MID, TYPE_META } from "../shared/style/tokens.js";
import {
  BLOCK_TAGS,
  regionBoxStyle,
  regionChipStyle,
  regionActionsStyle,
  regionActionButtonStyle,
  chipDirtyDotStyle,
} from "../core/page-region-chrome.js";

const COLLECTION_GLYPH = TYPE_META.Collection.glyph;

/**
 * @import { CollectionItemResponse } from "../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {string} [group]
 * @property {string} [label]      Drawer card and page chip text (default: `"{collection} · {slug}"`).
 * @property {React.ReactNode} [fallback]
 *   Shown while the record loads. Client path only; the server one has awaited
 *   the record before rendering anything.
 * @property {React.ReactNode} [missing]
 *   Shown when the record does not exist (404). Defaults to nothing.
 * @property {React.ReactNode} [error]
 *   Shown when the read failed for any other reason, kept apart from `missing`
 *   so a broken backend doesn't read as "no such record". Defaults to `missing`.
 *   Retry needs a callback, which no longer crosses the children boundary: build
 *   one with `useCollectionItem` in your own client component.
 * @property {React.ReactNode} children
 */

/**
 * Client entry point: fetches the record, then hands it to `CollectionRecord`.
 *
 * @param {CollectionItemProps} props
 */
export function CollectionItem({
  collection, slug, group, label, fallback, missing, error: errorNode, children,
}) {
  // Raw, not draft-overlaid: the overlay would rebuild `item` on every
  // keystroke and carry that through the record's scope to every field, which
  // is exactly what field-level selection avoids. Fields read live values from
  // the editor (`useEditorField`) or the record (`useCollectionRecord`), both of
  // which subscribe to the draft themselves.
  const { item, isLoading, error } = useCollectionItem(collection, slug, {
    overlayDrafts: false,
  });

  if (isLoading) return fallback ?? null;
  if (error) {
    return /** @type {*} */ (error).isNotFound
      ? (missing ?? null)
      : (errorNode ?? missing ?? null);
  }
  if (!item) return missing ?? null;

  return (
    <CollectionRecord
      collection={collection}
      slug={slug}
      item={item}
      group={group}
      label={label}
    >
      {children}
    </CollectionRecord>
  );
}

/**
 * Everything about a record except fetching it: the drawer binding, the scope
 * `<CollectionField>` reads, and the admin editing chrome. Split out so both
 * entry points share it: the client one above, and the server one from
 * `createCmsPage`, which awaits `getCmsCollectionItem` and passes `item` down.
 *
 * @param {{
 *   collection: string,
 *   slug: string,
 *   item: CollectionItemResponse,
 *   group?: string,
 *   label?: string,
 *   children: React.ReactNode,
 * }} props
 */
export function CollectionRecord({ collection, slug, item, group, label, fromRegion, children }) {
  const {
    isAdmin, uiStore, setActiveBlock,
    registerEditorVisibility, unregisterEditorVisibility,
  } = useCmsContext();
  const {
    registerCollectionBinding, unregisterCollectionBinding, collectionStore,
  } = useCollectionContext();
  const groupPrefix = useContext(CmsGroupContext);
  // Distinguishes this element from any other bound to the same record, which
  // is how the provider elects one of them to drive the shared draft.
  const scopeId = useId();

  const bindingId = collectionItemBindingId(collection, slug);
  const cardGroup = group ?? groupPrefix;
  const cardLabel = label ?? `${collection} · ${slug}`;

  // Hand the binding to the drawer for its Page-tab card. Public visitors
  // register too, keeping register/unregister symmetric across mode switches.
  useEffect(() => {
    /** @type {import("../shared/contracts/schemas.js").CollectionBinding} */
    const binding = { collection, slug, group: cardGroup, label: cardLabel };
    if (fromRegion) binding.fromRegion = fromRegion;
    registerCollectionBinding(bindingId, binding);
    return () => unregisterCollectionBinding(bindingId);
  }, [
    bindingId, collection, slug, cardGroup, cardLabel, fromRegion,
    registerCollectionBinding, unregisterCollectionBinding,
  ]);

  // A record inside a hidden or locked `<CmsGroup>` follows the group, the same
  // way content blocks do. Registered under the binding id because that is what
  // the drawer files the synthesised Collection row under.
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  useEffect(() => {
    if (!isAdmin || !groupVisibility) return undefined;
    registerEditorVisibility(bindingId, groupVisibility);
    return () => unregisterEditorVisibility(bindingId);
  }, [isAdmin, bindingId, groupVisibility, registerEditorVisibility, unregisterEditorVisibility]);

  // Booleans, not the maps: editing another record leaves this binding alone.
  const hasDraft = useStoreSelector(collectionStore, (st) => st.drafts.has(`${collection}:${slug}`));
  const isActive = useStoreSelector(uiStore, (s) => s.activeBlock === bindingId);

  // Readers still get a scope: `<CollectionField>` renders the value for them,
  // it just has no editor behind it.
  const readScope = useMemo(
    () => ({ collection, slug, scopeId, item, editor: null }),
    [collection, slug, scopeId, item],
  );

  if (!isAdmin || !item.canEdit || groupVisibility) {
    return (
      <CollectionItemContext.Provider value={readScope}>
        {children}
      </CollectionItemContext.Provider>
    );
  }

  return (
    <CollectionEditScope
      collection={collection}
      slug={slug}
      scopeId={scopeId}
      item={item}
      bindingId={bindingId}
      label={cardLabel}
      tag={elementTag(children)}
      dirty={hasDraft || item.draftData != null}
      isActive={isActive}
      setActiveBlock={setActiveBlock}
    >
      {children}
    </CollectionEditScope>
  );
}

/**
 * The wrapper's display mode follows the children's own element, so a record
 * around a `<div>` gets the padded card and one inside a sentence stays tight.
 * Only a single element can answer; anything else falls back to inline.
 *
 * @param {React.ReactNode} children
 * @returns {string | null}
 */
function elementTag(children) {
  return isValidElement(children) && typeof children.type === "string"
    ? children.type
    : null;
}

/**
 * The editing half, split out so the editor engine (schema lookup, seeded
 * values, autosave) never mounts for a visitor or a record they can't edit.
 *
 * It drives the draft only while the page actually carries `<CollectionField>`s
 * for this record; otherwise the drawer's card stays the driver and this scope
 * is just the ring plus a read-only view of the same values.
 *
 * @param {{
 *   collection: string,
 *   slug: string,
 *   scopeId: string,
 *   item: CollectionItemResponse,
 *   bindingId: string,
 *   label: string,
 *   tag: string | null,
 *   dirty: boolean,
 *   isActive: boolean,
 *   setActiveBlock: (path: string | null) => void,
 *   children: React.ReactNode,
 * }} props
 */
function CollectionEditScope({
  collection, slug, scopeId, item, bindingId, label, tag, dirty,
  isActive, setActiveBlock, children,
}) {
  // Without fields on the page there is nothing here to show or type into, so
  // the record's draft is left entirely to the drawer. With them, the page
  // mirrors the draft, but only the elected scope writes it.
  const role = useRecordDraftRole(collection, slug, scopeId);
  const editor = useCollectionEditor(collection, slug, role);

  const scope = useMemo(
    () => ({ collection, slug, scopeId, item, editor }),
    [collection, slug, scopeId, item, editor],
  );

  return (
    <CollectionItemContext.Provider value={scope}>
      <CollectionEditWrapper
        onClick={() => setActiveBlock(bindingId)}
        isActive={isActive}
        label={label}
        tag={tag}
        dirty={dirty}
        actions={
          // Without fields there is nothing to publish from here: the record's
          // edits happen in the drawer, which carries its own actions.
          role.mirror ? <RecordActions editor={editor} dirty={dirty} /> : null
        }
      >
        {children}
      </CollectionEditWrapper>
    </CollectionItemContext.Provider>
  );
}

/**
 * Publish / revert for edits made through the page's own fields, so an in-place
 * change doesn't have to travel to the drawer to be published. Both call the
 * same handlers the drawer card uses.
 *
 * @param {{ editor: import("./hooks/use-collection-editor.js").CollectionEditorState, dirty: boolean }} props
 */
function RecordActions({ editor, dirty }) {
  const t = useCmsStrings();
  const busy = editor.isPending;
  // The button carries the outcome: there is no room beside it for a banner,
  // and a publish that failed silently is worse than one that says so.
  const state = busy ? "saving"
    : editor.error ? "failed"
    : editor.publishedFlash ? "saved"
    : "idle";
  const { labelKey, accent } = SAVE_STATES[state];
  // Only a plain idle button goes quiet when there is nothing to publish; a
  // result the user still needs to read stays at full strength.
  const inert = state === "idle" && !dirty;

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          editor.undoDraft();
        }}
        disabled={!dirty || busy}
        title={t("collections.undoRecordDraft")}
        style={regionActionButtonStyle({ font: FONT_MONO, accent: TEXT_MID, disabled: !dirty || busy })}
      >
        {t("block.undo")}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          editor.save();
        }}
        disabled={inert || busy}
        title={editor.error ?? t("collections.publishRecord")}
        style={regionActionButtonStyle({ font: FONT_MONO, accent, disabled: inert })}
      >
        {t(labelKey)}
      </button>
    </>
  );
}

const SAVE_STATES = {
  idle:   { labelKey: "status.save", accent: COLLECTION_ACCENT },
  saving: { labelKey: "collections.saving", accent: TEXT_MID },
  saved:  { labelKey: "collections.saved", accent: STATUS_OK },
  failed: { labelKey: "collections.error", accent: STATUS_DANGER },
};

/**
 * Same shell as `EditableRegion`, in the collection accent: a neutral ring on
 * hover, the accent once selected, and the padded card (plus a chip that
 * straddles its ring line) when the rendered content is block-level.
 *
 * @param {{
 *   onClick: (e: React.MouseEvent) => void,
 *   isActive: boolean,
 *   label: string,
 *   dirty: boolean,
 *   tag: string | null,
 *   actions?: React.ReactNode,
 *   children: React.ReactNode,
 * }} props
 */
function CollectionEditWrapper({ onClick, isActive, label, dirty, tag, actions, children }) {
  const t = useCmsStrings();
  const [isHovered, setIsHovered] = useState(false);
  const showChip = isHovered || isActive;

  const display = tag && BLOCK_TAGS.has(tag) ? "block" : "inline-block";
  const roomy = display === "block";

  return (
    <span
      style={regionBoxStyle({
        display,
        roomy,
        highlight: isActive,
        hovered: isHovered,
        accent: COLLECTION_ACCENT,
      })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {showChip ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
          title={t("collections.openInPanel")}
          aria-label={t("collections.openRecordInPanel", { label })}
          style={regionChipStyle({
            roomy,
            highlight: isActive,
            accent: COLLECTION_ACCENT,
            font: FONT_MONO,
          })}
        >
          <span aria-hidden="true" style={{ fontWeight: 700, opacity: 0.85 }}>
            {COLLECTION_GLYPH}
          </span>
          {label}
          {dirty ? (
            <span aria-label={t("block.unsavedDot")} style={chipDirtyDotStyle} />
          ) : null}
        </button>
      ) : null}
      {actions && showChip ? (
        <span style={regionActionsStyle({ roomy })}>{actions}</span>
      ) : null}
    </span>
  );
}
