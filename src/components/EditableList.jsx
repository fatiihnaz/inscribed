"use client";

/**
 * @file `<EditableList>`: render-prop component for `List`-typed blocks.
 *
 * Must be used inside a `"use client"` component: the render-prop child is a
 * function, which Next.js can't serialise across the server/client boundary, so
 * dropping it straight into a server `page.jsx` throws. Wrap it in your own
 * client component (see `team-section.jsx` in the example app).
 *
 * Public mode maps each item through the render-prop in a key'd Fragment.
 *
 *   <EditableList blockPath="team.members" itemSchema={{
 *     name:  { blockType: "Text",  defaultValue: "" },
 *     photo: { blockType: "Image", defaultValue: { src: "", alt: "" } },
 *   }}>
 *     {(item, i) => (
 *       <article className="member-card">
 *         <img src={item.photo.src} alt={item.photo.alt} />
 *         <h3>{item.name}</h3>
 *       </article>
 *     )}
 *   </EditableList>
 *
 * Admin mode adds per-item controls (delete, move) and an "+ Add" button. All
 * mutations go through `setDraft`, so the drawer's save bar picks them up; one
 * version per list, atomic save. `itemSchema`/`defaultValue` must be literals.
 *
 * By default the list renders no element of its own, so items sit directly in
 * whatever flex/grid container the consumer wraps it in. Pass `as` (plus the
 * layout props that container had) to fold that wrapper into the list and get
 * the page-side ring + label chip on the block as a whole.
 */

import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, Trash2, ChevronUp, ChevronDown } from "./icons.jsx";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { deepEqual } from "../lib/deep-equal.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { addItem, makeDefaultItem, moveItem, removeItem } from "../lib/list-ops.js";
import { ACCENT, FONT_MONO, STATUS_DANGER, BG_RAISED, BORDER, TYPE_META } from "./admin-drawer-styles.js";
import {
  BLOCK_TAGS,
  regionBoxStyle,
  regionChipStyle,
  chipDirtyDotStyle,
} from "./page-region-chrome.js";

/**
 * @import { ItemSchema } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} EditableListProps
 * @property {string} blockPath
 * @property {ItemSchema} itemSchema
 *   Per-field metadata. Required: "+ Add" uses it for the seed item, discovery
 *   builds the manifest entry's `itemSchema` from it.
 * @property {(item: Record<string, *>, index: number) => React.ReactNode} children
 * @property {string} [as]
 *   Wrapper tag for the whole list. Without it the list is transparent (items
 *   land straight in the consumer's flex/grid container) and the page has no
 *   list-level edit affordance. With it, the wrapper renders in public mode
 *   too, so admin and public layout stay identical, and admin mode adds the
 *   ring + label chip. Extra props (`style`, `className`, ...) go to it.
 * @property {*[]} [defaultValue]
 *   Discovery-only seed, default `[]`. Pass an array to pre-seed items.
 * @property {"global"} [scope]
 *   Discovery-only. `"global"` shares the list across every page.
 * @property {boolean} [editable]
 *   When `false`, the list is read-only (no add/move/delete) and its drawer
 *   card is locked. Mirrors `<EditableRegion editable>` and `<CmsGroup>`.
 * @property {boolean} [visible]
 *   When `false`, the list is dropped from the drawer and read-only on the page
 *   (items still ship to the DOM). Wins over `editable`; inheritable from `<CmsGroup>`.
 */

const ITEM_RING       = `inset 0 0 0 1.5px color-mix(in srgb, ${ACCENT} 30%, transparent)`;
const ITEM_BG         = `color-mix(in srgb, ${ACCENT} 5%, transparent)`;
const ACCENT_DIM      = `color-mix(in srgb, ${ACCENT} 65%, transparent)`;
const DANGER          = STATUS_DANGER;
// Match the AdminDrawer's raised panel surface so the per-item controls
// visually belong to the same admin layer.
const PANEL_BG        = BG_RAISED;
const PANEL_BORDER    = `1px solid ${BORDER}`;

/**
 * @param {EditableListProps} props
 */
export function EditableList({ blockPath, itemSchema, children, defaultValue, scope, editable, visible, as, ...rest }) {
  void defaultValue; void scope; // discovery-only
  const {
    isAdmin, blocksStore, contentDraftsStore, uiStore, setDraft,
    registerItemSchema, unregisterItemSchema,
    registerEditorVisibility, unregisterEditorVisibility,
    setActiveBlock, setActiveListItem,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-prefix under a `<CmsGroup>`, matching discovery's static rule.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Fold own `visible`/`editable` with the inherited group mode, most
  // restrictive wins (see EditableRegion).
  const ownMode = visible === false ? "hidden" : editable === false ? "readonly" : null;
  const visibilityMode = strongerVisibility(groupVisibility, ownMode);

  // Hand the schema to the drawer so it can build the per-field item editor.
  // Keyed on the schema's *shape*, not its identity: consumers write it as an
  // inline literal, so a re-render of the parent would otherwise unregister and
  // re-register an unchanged schema and churn the drawer for nothing.
  const schemaKey = stableStringify(itemSchema);
  const itemSchemaRef = useRef(itemSchema);
  itemSchemaRef.current = itemSchema;
  useEffect(() => {
    // Admin-only like the visibility effect below, but NOT gated on
    // visibilityMode: a readonly list still needs its schema so the drawer can
    // render the disabled editor.
    if (!isAdmin) return undefined;
    registerItemSchema(fullPath, itemSchemaRef.current);
    return () => unregisterItemSchema(fullPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, fullPath, schemaKey, registerItemSchema, unregisterItemSchema]);

  useEffect(() => {
    if (!isAdmin || !visibilityMode) return undefined;
    registerEditorVisibility(fullPath, visibilityMode);
    return () => unregisterEditorVisibility(fullPath);
  }, [isAdmin, fullPath, visibilityMode, registerEditorVisibility, unregisterEditorVisibility]);

  // Subscribe to just this list's draft slice (two-selector presence/value, see
  // EditableRegion) so typing in one list doesn't re-render siblings.
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  const slug = usePathname() ?? "/";
  const block = useStoreSelector(blocksStore, (s) => s.get(slug)?.get(fullPath));
  const isActive = useStoreSelector(uiStore, (s) => s.activeBlock === fullPath);
  // Precedence (as EditableRegion): local draft > backend `draftValue` >
  // published value, so a saved-but-unpublished list survives navigation.
  const raw = hasLocalDraft
    ? localDraft
    : block
      ? (block.draftValue ?? block.value)
      : undefined;
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(raw) ? raw : [];

  /** @param {Record<string, *>[]} next */
  const setItems = (next) => setDraft(fullPath, next);

  // Public visitors and read-only/hidden lists get the plain passthrough: items
  // render, but no add/move/delete. The drawer card lock/removal is the
  // registry's job. `as` still renders, so the layout doesn't shift between
  // public and admin.
  if (!isAdmin || visibilityMode) {
    const body = items.map((item, i) => (
      <Fragment key={i}>{children(item, i)}</Fragment>
    ));
    if (!as) return <>{body}</>;
    const Wrapper = /** @type {*} */ (as);
    return <Wrapper {...rest}>{body}</Wrapper>;
  }

  const defaultItem = makeDefaultItem(itemSchema);
  const onAdd = () => setItems(addItem(items, itemSchema));
  /** @param {number} i */
  const onRemove = (i) => setItems(removeItem(items, i));
  /** @param {number} i @param {-1|1} dir */
  const onMove = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    setItems(next);
  };

  const body = (
    <>
      {items.map((item, i) => (
        <AdminItemWrapper
          key={i}
          onActivate={() => {
            setActiveBlock(fullPath);
            setActiveListItem({ path: fullPath, index: i });
          }}
          onRemove={() => onRemove(i)}
          onMoveUp={i > 0 ? () => onMove(i, -1) : null}
          onMoveDown={i < items.length - 1 ? () => onMove(i, 1) : null}
        >
          {children(item, i)}
        </AdminItemWrapper>
      ))}

      <GhostAddSlot onAdd={onAdd}>
        {children(defaultItem, items.length)}
      </GhostAddSlot>
    </>
  );

  // Without `as` there is no element to hang a ring or chip on, so the list
  // keeps its transparent shape and only the items carry chrome.
  if (!as) return body;

  const Wrapper = /** @type {*} */ (as);
  const dirty = block
    ? (hasLocalDraft
        ? !deepEqual(localDraft, block.value)
        : block.draftValue != null)
    : false;
  const roomy = BLOCK_TAGS.has(Wrapper);
  const userStyle = /** @type {React.CSSProperties} */ (rest.style ?? {});

  return (
    <Wrapper
      {...rest}
      style={{
        ...userStyle,
        // Insets last: a consumer `margin` shorthand would otherwise reset the
        // roomy card's negative side margins back to zero.
        ...regionBoxStyle({
          display: userStyle.display ?? (roomy ? "block" : "inline-block"),
          roomy,
          highlight: isActive,
          hovered: isHovered,
          accent: ACCENT,
        }),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {body}
      {(isHovered || isActive) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveBlock(fullPath);
            // The chip targets the list itself, so drop any item the drawer
            // was told to scroll to.
            setActiveListItem(null);
          }}
          title="Panelde aç"
          aria-label={`${fullPath} listesini panelde aç`}
          style={regionChipStyle({ roomy, highlight: isActive, accent: ACCENT, font: FONT_MONO })}
        >
          <span aria-hidden="true" style={{ fontWeight: 700, opacity: 0.85 }}>
            {TYPE_META.List.glyph}
          </span>
          {fullPath}
          {dirty && <span aria-label="Kaydedilmemiş değişiklik" style={chipDirtyDotStyle} />}
        </button>
      )}
    </Wrapper>
  );
}

/**
 * @param {{
 *   children: React.ReactNode,
 *   onActivate: () => void,
 *   onRemove: () => void,
 *   onMoveUp: (() => void) | null,
 *   onMoveDown: (() => void) | null,
 * }} props
 */
function AdminItemWrapper({ children, onActivate, onRemove, onMoveUp, onMoveDown }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onClick={onActivate}
      style={{
        position: "relative",
        cursor: "pointer",
        boxShadow: isHovered ? ITEM_RING : undefined,
        backgroundColor: isHovered ? ITEM_BG : undefined,
        transition: "box-shadow 0.15s ease, background-color 0.2s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered ? (
        <div
          style={controlsStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onMoveUp ? (
            <button type="button" onClick={onMoveUp} style={iconButtonStyle} title="Yukarı taşı">
              <ChevronUp size={12} />
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" onClick={onMoveDown} style={iconButtonStyle} title="Aşağı taşı">
              <ChevronDown size={12} />
            </button>
          ) : null}
          <button type="button" onClick={onRemove} style={dangerButtonStyle} title="Sil">
            <Trash2 size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders the consumer's card with `visibility: hidden` so the add slot keeps a
 * real item's footprint (for grid/flex), with a dashed overlay on top. Click
 * seeds a new item from the schema defaults. The hidden child is `aria-hidden`.
 *
 * @param {{ children: React.ReactNode, onAdd: () => void }} props
 */
function GhostAddSlot({ children, onAdd }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lit = hovered || focused;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Yeni öğe ekle"
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "relative",
        cursor: "pointer",
        borderRadius: 8,
        background: lit
          ? `color-mix(in srgb, ${ACCENT} 10%, transparent)`
          : `color-mix(in srgb, ${ACCENT} 4%, transparent)`,
        border: lit
          ? `1.5px dashed color-mix(in srgb, ${ACCENT} 70%, transparent)`
          : `1.5px dashed color-mix(in srgb, ${ACCENT} 30%, transparent)`,
        transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
        transform: lit ? "translateY(-1px)" : undefined,
        outline: "none",
      }}
    >
      <div style={ghostHiddenStyle} aria-hidden="true">
        {children}
      </div>
      <div
        style={{
          ...ghostOverlayStyle,
          color: lit ? ACCENT : ACCENT_DIM,
        }}
      >
        <Plus size={15} />
        <span>Öğe ekle</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (kept inline; admin overlays only render in admin mode)
// ---------------------------------------------------------------------------

const controlsStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  top: 4,
  right: 4,
  display: "inline-flex",
  gap: 4,
  padding: 3,
  background: PANEL_BG,
  border: PANEL_BORDER,
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  zIndex: 9999,
});

const iconButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: ACCENT_DIM,
  borderRadius: 4,
  cursor: "pointer",
  padding: 0,
});

const dangerButtonStyle = /** @type {React.CSSProperties} */ ({
  ...iconButtonStyle,
  color: DANGER,
});

const ghostHiddenStyle = /** @type {React.CSSProperties} */ ({
  visibility: "hidden",
  pointerEvents: "none",
});

const ghostOverlayStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.02em",
  pointerEvents: "none",
  transition: "color 0.18s ease",
});
