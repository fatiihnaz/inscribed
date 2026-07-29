"use client";

/**
 * @file `<CollectionItem>`: render-prop primitive for one collection row.
 *
 * Public visitors get the children function's output. Admins with
 * `item.canEdit` also get a click-to-focus wrapper (like EditableRegion) that
 * opens the matching drawer card; edits and re-render happen there.
 *
 * `item` is null while loading and on error, so branch on `meta.isLoading` /
 * `meta.error` first. 404s arrive as `meta.error` with `error.isNotFound`.
 *
 *   <CollectionItem collection="News" slug="q1-release-notes">
 *     {(item, { isLoading, error }) => (
 *       isLoading            ? <Skeleton /> :
 *       error?.isNotFound    ? <NotFound /> :
 *       error                ? <ErrorBanner message={error.message} /> :
 *                              <Article {...item.data} />
 *     )}
 *   </CollectionItem>
 *
 * The binding identifies itself by the record it points at, so rendering the
 * same item twice on a page yields one drawer card, not two.
 */

import { useContext, useEffect, useId, useMemo, useState } from "react";

import { useCmsContext } from "../lib/context.js";
import { collectionItemBindingId, useCollectionContext } from "../lib/collection-context.js";
import { CollectionItemContext } from "../lib/collection-item-context.js";
import { CmsGroupContext } from "../lib/group-context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useStoreSelector } from "../lib/store.js";
import { useCollectionEditor } from "./AdminCollectionEditor.jsx";
import {
  COLLECTION_ACCENT, FONT_MONO, STATUS_DANGER, STATUS_OK, TEXT_MID, TYPE_META,
} from "./admin-drawer-styles.js";
import {
  BLOCK_TAGS,
  regionBoxStyle,
  regionChipStyle,
  regionActionsStyle,
  regionActionButtonStyle,
  chipDirtyDotStyle,
} from "./page-region-chrome.js";

const COLLECTION_GLYPH = TYPE_META.Collection.glyph;

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/errors.js"
 */

/**
 * @typedef {Object} CollectionItemMeta
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {string} [group]
 * @property {string} [label]      Drawer card and page chip text (default: `"{collection} · {slug}"`).
 * @property {(item: CollectionItemResponse | null, meta: CollectionItemMeta) => React.ReactNode} children
 */

/**
 * @param {CollectionItemProps} props
 */
export function CollectionItem({ collection, slug, group, label, children }) {
  const { isAdmin, activeBlock, setActiveBlock } = useCmsContext();
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
    registerCollectionBinding(bindingId, { collection, slug, group: cardGroup, label: cardLabel });
    return () => unregisterCollectionBinding(bindingId);
  }, [
    bindingId, collection, slug, cardGroup, cardLabel,
    registerCollectionBinding, unregisterCollectionBinding,
  ]);

  const { item, isLoading, error, refetch } = useCollectionItem(collection, slug);
  const drafts = useStoreSelector(collectionStore, (st) => st.drafts);
  const rendered = /** @type {*} */ (children(item, { isLoading, error, refetch }));

  // Readers still get a scope: `<CollectionField>` renders the value for them,
  // it just has no editor behind it.
  const readScope = useMemo(
    () => ({ collection, slug, scopeId, item, editor: null }),
    [collection, slug, scopeId, item],
  );

  if (!isAdmin || !item || !item.canEdit) {
    return (
      <CollectionItemContext.Provider value={readScope}>
        {rendered}
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
      tag={typeof rendered?.type === "string" ? rendered.type : null}
      dirty={drafts.has(`${collection}:${slug}`) || item.draftData != null}
      activeBlock={activeBlock}
      setActiveBlock={setActiveBlock}
    >
      {rendered}
    </CollectionEditScope>
  );
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
 *   activeBlock: string | null,
 *   setActiveBlock: (path: string | null) => void,
 *   children: React.ReactNode,
 * }} props
 */
function CollectionEditScope({
  collection, slug, scopeId, item, bindingId, label, tag, dirty,
  activeBlock, setActiveBlock, children,
}) {
  const { inlineFieldRecords } = useCollectionContext();
  const driver = inlineFieldRecords.get(`${collection}:${slug}`);
  const hasInlineFields = driver !== undefined;
  // Without fields on the page there is nothing here to show or type into, so
  // the record's draft is left entirely to the drawer. With them, the page
  // mirrors the draft, but only the elected scope PUTs it.
  const editor = useCollectionEditor(collection, slug, {
    active: driver === scopeId,
    mirror: hasInlineFields,
  });

  const scope = useMemo(
    () => ({ collection, slug, scopeId, item, editor }),
    [collection, slug, scopeId, item, editor],
  );

  return (
    <CollectionItemContext.Provider value={scope}>
      <CollectionEditWrapper
        onClick={() => setActiveBlock(bindingId)}
        isActive={activeBlock === bindingId}
        label={label}
        tag={tag}
        dirty={dirty}
        actions={
          // Without fields there is nothing to publish from here: the record's
          // edits happen in the drawer, which carries its own actions.
          hasInlineFields ? <RecordActions editor={editor} dirty={dirty} /> : null
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
 * @param {{ editor: import("./AdminCollectionEditor.jsx").CollectionEditorState, dirty: boolean }} props
 */
function RecordActions({ editor, dirty }) {
  const busy = editor.isPending;
  // The button carries the outcome: there is no room beside it for a banner,
  // and a publish that failed silently is worse than one that says so.
  const state = busy ? "saving"
    : editor.error ? "failed"
    : editor.publishedFlash ? "saved"
    : "idle";
  const { label, accent } = SAVE_STATES[state];
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
        title="Bu kaydın taslağını geri al"
        style={regionActionButtonStyle({ font: FONT_MONO, accent: TEXT_MID, disabled: !dirty || busy })}
      >
        Geri al
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          editor.save();
        }}
        disabled={inert || busy}
        title={editor.error ?? "Bu kaydı yayınla"}
        style={regionActionButtonStyle({ font: FONT_MONO, accent, disabled: inert })}
      >
        {label}
      </button>
    </>
  );
}

const SAVE_STATES = {
  idle:   { label: "Kaydet", accent: COLLECTION_ACCENT },
  saving: { label: "Kaydediliyor…", accent: TEXT_MID },
  saved:  { label: "Kaydedildi", accent: STATUS_OK },
  failed: { label: "Hata", accent: STATUS_DANGER },
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
          title="Panelde aç"
          aria-label={`${label} kaydını panelde aç`}
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
            <span aria-label="Kaydedilmemiş değişiklik" style={chipDirtyDotStyle} />
          ) : null}
        </button>
      ) : null}
      {actions && showChip ? (
        <span style={regionActionsStyle({ roomy })}>{actions}</span>
      ) : null}
    </span>
  );
}
