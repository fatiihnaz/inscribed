"use client";

/**
 * @file The editing half of a collection record, reached through a dynamic
 * import so a visitor's bundle carries none of it.
 *
 * This is where the editor engine actually mounts (schema lookup, seeded
 * values, the debounced autosave), along with the ring, the chip and the
 * publish/revert pair. A page listing news for the public needs none of it, and
 * the read-only scope the public half publishes is enough for
 * `<CollectionField>` to render every value.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { CollectionItemContext } from "./item-context.js";
import { useContentRadius } from "../core/hooks/use-content-radius.js";
import { useRecordDraftRole } from "./hooks/use-draft-driver.js";
import { useCollectionEditor } from "./hooks/use-collection-editor.js";
import { COLLECTION_ACCENT, STATUS_DANGER, STATUS_OK, TEXT_HI } from "../shared/style/tokens.js";
import { TypeCollection } from "../shared/style/icons.jsx";
import {
  BLOCK_TAGS,
  CHROME_ICON,
  INK_BTN_CLASS,
  INK_CHIP_CLASS,
  ensureInkChromeStyle,
  regionBoxStyle,
  regionChipStyle,
  regionActionsStyle,
  regionActionButtonStyle,
  chipDirtyDotStyle,
} from "../core/page-region-chrome.js";

/**
 * @import { CollectionItemResponse } from "../shared/contracts/schemas.js"
 */

/**
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
export function CollectionEditScope({
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
        className={INK_BTN_CLASS}
        style={regionActionButtonStyle({ accent: TEXT_HI, disabled: !dirty || busy })}
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
        className={INK_BTN_CLASS}
        style={regionActionButtonStyle({ accent, disabled: inert })}
      >
        {t(labelKey)}
      </button>
    </>
  );
}

const SAVE_STATES = {
  idle:   { labelKey: "status.save", accent: COLLECTION_ACCENT },
  saving: { labelKey: "collections.saving", accent: TEXT_HI },
  saved:  { labelKey: "collections.saved", accent: STATUS_OK },
  failed: { labelKey: "collections.error", accent: STATUS_DANGER },
};

/**
 * Same shell as `EditableRegion`, in the collection accent: a neutral ring on
 * hover, the accent once selected, and the full halo (plus a chip that
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
  const boxRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const [isHovered, setIsHovered] = useState(false);
  const showChip = isHovered || isActive;

  useEffect(() => {
    ensureInkChromeStyle();
  }, []);

  const display = tag && BLOCK_TAGS.has(tag) ? "block" : "inline-block";
  const roomy = display === "block";
  // Records render whatever card the consumer wrote, so the ring takes its
  // radius rather than imposing the house one.
  const contentRadius = useContentRadius(boxRef, showChip);

  return (
    <span
      ref={boxRef}
      style={regionBoxStyle({
        display,
        roomy,
        highlight: isActive,
        hovered: isHovered,
        accent: COLLECTION_ACCENT,
        radius: contentRadius,
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
          className={INK_CHIP_CLASS}
          style={regionChipStyle({ roomy, highlight: isActive, accent: COLLECTION_ACCENT })}
        >
          <TypeCollection size={CHROME_ICON} style={{ flexShrink: 0, opacity: 0.8 }} />
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
