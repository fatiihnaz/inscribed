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

import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Plus, Trash2, GripVertical, TypeList,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from "../shared/style/icons.jsx";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsRoute } from "./hooks/use-cms-route.js";
import { useCmsStrings } from "./hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { deepEqual } from "../shared/util/deep-equal.js";
import { stableStringify } from "../shared/util/stable-stringify.js";
import { CmsGroupContext, CmsGroupVisibilityContext, ownVisibility, strongerVisibility } from "../shared/state/group-context.js";
import { addItem, makeDefaultItem, moveItem, moveItemTo, moveItemToIndex, removeItem } from "../shared/util/list-ops.js";
import { PositionField } from "../shared/ui/PositionField.jsx";
import {
  layoutBox, neighbourDirection, useListReorder,
  LANDING_TRANSFORM, SHIFT_TRANSFORM, SETTLE_MS, SHIFT_MS,
} from "./hooks/use-list-reorder.js";
import { useContentRadius } from "./hooks/use-content-radius.js";
import {
  ACCENT, DUR_FAST, EASE, FONT_SANS, FS_XS, R_SM,
  STATUS_DANGER, TEXT, TEXT_HI, RING_RADIUS,
} from "../shared/style/tokens.js";
import {
  BLOCK_TAGS,
  CHROME_CONTROL,
  CHROME_ICON,
  CHROME_LIFT_Z,
  CHROME_STROKE,
  INK_BTN_CLASS,
  INK_CHIP_CLASS,
  ensureInkChromeStyle,
  inkDividerStyle,
  regionBoxStyle,
  regionChipStyle,
  regionActionsStyle,
  regionActionButtonStyle,
  chipDirtyDotStyle,
} from "./page-region-chrome.js";

/**
 * @import { ItemSchema } from "../shared/contracts/schemas.js"
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
 * @property {boolean} [readOnly]
 *   The list is read-only (no add/move/delete) and its drawer card is locked.
 *   Mirrors `<EditableRegion readOnly>` and `<CmsGroup>`.
 * @property {boolean} [hidden]
 *   The list is dropped from the drawer and read-only on the page (items still
 *   ship to the DOM). Wins over `readOnly`; inheritable from `<CmsGroup>`.
 *   Consumed here, so it never reaches the wrapper as the HTML attribute.
 * @property {boolean} [noInlineAdd]
 *   Drops the in-page add slot, for layouts a ghost card would spoil (a slider,
 *   a fixed grid). Items can still be added from the drawer, and the rest of the
 *   page-side editing is untouched. Without `as`, an empty list then renders
 *   nothing at all, so the drawer is the only way in.
 * @property {boolean} [editable]
 *   Deprecated, use `readOnly`. Older, inverted spelling: `editable={false}`
 *   locks the list. Still honoured.
 * @property {boolean} [visible]
 *   Deprecated, use `hidden`. Older, inverted spelling: `visible={false}` hides
 *   the list. Still honoured.
 * @property {boolean} [inlineAdd]
 *   Deprecated, use `noInlineAdd`. Older, inverted spelling: `inlineAdd={false}`
 *   drops the slot. Still honoured.
 */

const ACCENT_DIM = `color-mix(in srgb, ${ACCENT} 65%, transparent)`;

// Held card: off the page, over its neighbours rather than between them.
const LIFT_SHADOW = "0 12px 28px -8px rgba(0, 0, 0, 0.45), 0 2px 8px -2px rgba(0, 0, 0, 0.3)";

/** @type {Record<string, typeof ChevronUp>} */
const DIRECTION_ICON = {
  up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight,
};

/** @type {Record<string, string>} */
const DIRECTION_LABEL = {
  up: "core.item.moveUp",
  down: "core.item.moveDown",
  left: "core.item.moveLeft",
  right: "core.item.moveRight",
};

/**
 * @param {EditableListProps} props
 */
export function EditableList({ blockPath, itemSchema, children, defaultValue, scope, hidden, readOnly, noInlineAdd, editable, visible, inlineAdd = true, as, ...rest }) {
  void defaultValue; void scope; // discovery-only
  const {
    isAdmin, blocksStore, contentDraftsStore, uiStore, setDraft,
    registerItemSchema, unregisterItemSchema,
    registerEditorVisibility, unregisterEditorVisibility,
    setActiveBlock, setActiveListItem,
  } = useCmsContext();
  const t = useCmsStrings();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-prefix under a `<CmsGroup>`, matching discovery's static rule.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Fold own `hidden`/`readOnly` with the inherited group mode, most
  // restrictive wins (see EditableRegion).
  const visibilityMode = strongerVisibility(groupVisibility, ownVisibility({ hidden, readOnly, visible, editable }));
  // Either spelling switches the slot off.
  const showInlineAdd = inlineAdd && !noInlineAdd;

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

  // Covers the item rows too: they are children, so their own effects have
  // already run by the time this one does, and neither can be interacted with
  // before the first paint.
  useEffect(() => {
    if (isAdmin) ensureInkChromeStyle();
  }, [isAdmin]);

  // Without `as` there is no element for `rest` to land on, so it is dropped.
  // Worth saying out loud: the symptom is a layout prop that silently does
  // nothing, which reads as a styling bug rather than a missing prop. Joined
  // into a string because `rest` is a fresh object every render.
  const droppedProps = as ? "" : Object.keys(rest).join(", ");
  useEffect(() => {
    if (!droppedProps || process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] <EditableList blockPath="${fullPath}"> received ${droppedProps} but no \`as\`, so those props are dropped and the list renders no element of its own. Pass \`as\` (e.g. as="div") to fold your container into the list.`,
    );
  }, [droppedProps, fullPath]);

  // Subscribe to just this list's draft slice (two-selector presence/value, see
  // EditableRegion) so typing in one list doesn't re-render siblings.
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  const { pathname } = useCmsRoute();
  const block = useStoreSelector(blocksStore, (s) => s.get(pathname)?.get(fullPath));
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

  // Index keys leave the DOM nodes in place and swap their content, so the
  // button just clicked now drives a different item. Sending focus after the
  // item keeps a second press on the same one.
  const [focusRequest, setFocusRequest] = useState(
    /** @type {{ index: number, dir: -1 | 1 } | null} */ (null),
  );
  const clearFocusRequest = useCallback(() => setFocusRequest(null), []);

  const { drag, flip, suppress, registerNode, beginDrag, animateMove } = useListReorder({
    onReorder: (from, to) => {
      const next = moveItemTo(items, from, to);
      if (next !== items) setItems(next);
    },
  });


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

  const onAdd = () => setItems(addItem(items, itemSchema));
  /** @param {number} i */
  const onRemove = (i) => setItems(removeItem(items, i));
  /** @param {number} i @param {-1|1} dir */
  const onMove = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    // Before the commit: the boxes have to be measured as they still are.
    animateMove(i, i + dir);
    setItems(next);
    setFocusRequest({ index: i + dir, dir });
  };
  /** @param {number} i @param {number} seat */
  const onMoveTo = (i, seat) => {
    const target = Math.max(0, Math.min(seat, items.length - 1));
    const next = moveItemToIndex(items, i, target);
    if (next === items) return;
    animateMove(i, target);
    setItems(next);
  };

  const body = (
    <>
      {items.map((item, i) => (
        <AdminItemWrapper
          key={i}
          index={i}
          total={items.length}
          registerNode={registerNode}
          onGrip={beginDrag}
          dragging={drag?.from === i}
          settling={drag?.settling ?? false}
          // Two booleans for the whole drag: positions travel to the DOM as CSS
          // variables, so crossing a slot costs a style write, not a render.
          shifting={drag != null}
          flipOffset={flip?.get(i) ?? null}
          suppressSlide={suppress}
          focusRequest={focusRequest?.index === i ? focusRequest.dir : null}
          onFocusHandled={clearFocusRequest}
          onActivate={() => {
            setActiveBlock(fullPath);
            setActiveListItem({ path: fullPath, index: i });
          }}
          onRemove={() => onRemove(i)}
          onMoveTo={(seat) => onMoveTo(i, seat)}
          onMoveBack={i > 0 ? () => onMove(i, -1) : null}
          onMoveForward={i < items.length - 1 ? () => onMove(i, 1) : null}
        >
          {children(item, i)}
        </AdminItemWrapper>
      ))}

      {/* The slot mirrors a real card, so the render-prop is only called with a
          blank item when the slot is actually there. */}
      {showInlineAdd ? (
        <GhostAddSlot onAdd={onAdd}>
          {children(makeDefaultItem(itemSchema), items.length)}
        </GhostAddSlot>
      ) : null}
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
        // Chrome last: this wrapper is the consumer's own element, and their
        // `outline` / `boxShadow` would otherwise swallow the region's ring.
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
          title={t("core.chip.open")}
          aria-label={t("core.chip.openList", { path: fullPath })}
          className={INK_CHIP_CLASS}
          style={regionChipStyle({ roomy, highlight: isActive, accent: ACCENT })}
        >
          <TypeList size={CHROME_ICON} style={{ flexShrink: 0, opacity: 0.8 }} />
          {fullPath}
          {dirty && <span aria-label={t("block.unsavedDot")} style={chipDirtyDotStyle} />}
        </button>
      )}
    </Wrapper>
  );
}

/**
 * One item's edit shell, in the same vocabulary as `EditableRegion`: neutral
 * ring on hover and the shared ink row of actions straddling the ring line.
 *
 * Hover-only by design: clicking an item selects the *list*, so the accent ring
 * belongs on the list wrapper and a second accent here would just double it.
 *
 * The row stays mounted at zero opacity rather than being conditional, because
 * an unmounted control cannot be tabbed to and a grip that vanished mid-gesture
 * would drop its pointer capture.
 *
 * @param {{
 *   children: React.ReactNode,
 *   index: number,
 *   total: number,
 *   registerNode: (index: number, el: HTMLElement | null) => void,
 *   onGrip: (index: number, event: React.PointerEvent) => void,
 *   dragging: boolean,
 *   settling: boolean,
 *   shifting: boolean,
 *   flipOffset: { dx: number, dy: number } | null,
 *   suppressSlide: boolean,
 *   focusRequest: -1 | 1 | null,
 *   onFocusHandled: () => void,
 *   onActivate: () => void,
 *   onRemove: () => void,
 *   onMoveTo: (seat: number) => void,
 *   onMoveBack: (() => void) | null,
 *   onMoveForward: (() => void) | null,
 * }} props
 */
function AdminItemWrapper({
  children, index, total, registerNode, onGrip,
  dragging, settling, shifting, flipOffset, suppressSlide,
  focusRequest, onFocusHandled,
  onActivate, onRemove, onMoveTo, onMoveBack, onMoveForward,
}) {
  const t = useCmsStrings();
  const boxRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const backRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const forwardRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const [isHovered, setIsHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // Measured, not assumed: in a two-column grid the item on the right moves
  // *down* to go forward. A property of the slot rather than the item, so it
  // only has to survive a relayout.
  const [dirs, setDirs] = useState(/** @type {{ back: string, forward: string }} */ ({
    back: "up", forward: "down",
  }));

  const shown = isHovered || focusWithin || dragging;
  // Every list styles its cards differently, so the ring takes whatever radius
  // the consumer gave theirs. Measured only while the ring is up, which keeps a
  // long list from resolving styles for rows nobody is looking at.
  const contentRadius = useContentRadius(boxRef, shown);

  useLayoutEffect(() => {
    if (!shown) return undefined;
    const measure = () => {
      const el = boxRef.current;
      if (!el) return;
      const self = layoutBox(el);
      const previous = el.previousElementSibling;
      const next = el.nextElementSibling;
      setDirs({
        back: (previous && neighbourDirection(self, layoutBox(/** @type {*} */ (previous)))) || "up",
        forward: (next && neighbourDirection(self, layoutBox(/** @type {*} */ (next)))) || "down",
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [shown]);

  useEffect(() => {
    if (!focusRequest) return;
    const wanted = focusRequest === -1 ? backRef.current : forwardRef.current;
    // At an end the wanted button is disabled and cannot take focus; the
    // opposite one keeps the row reachable. `preventScroll` leaves the smooth
    // scroll the move already started alone.
    const fallback = focusRequest === -1 ? forwardRef.current : backRef.current;
    (wanted && !wanted.disabled ? wanted : fallback)?.focus({ preventScroll: true });
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  const BackIcon = DIRECTION_ICON[dirs.back];
  const ForwardIcon = DIRECTION_ICON[dirs.forward];
  const backLabel = t(DIRECTION_LABEL[dirs.back]);
  const forwardLabel = t(DIRECTION_LABEL[dirs.forward]);

  const chrome = regionBoxStyle({
    display: "block",
    roomy: true,
    highlight: false,
    hovered: isHovered && !dragging,
    accent: ACCENT,
    radius: contentRadius,
  });
  // The held card tracks the pointer 1:1, so it must not be interpolated.
  // `suppressSlide` covers the frame the array changes under the nodes, where a
  // slide would drag the new content in from the old slot.
  const tracking = dragging && !settling;
  const slide = suppressSlide || tracking
    ? "none"
    : `transform ${dragging ? SETTLE_MS : SHIFT_MS}ms ${EASE}`;

  return (
    <div
      ref={(el) => {
        boxRef.current = el;
        registerNode(index, el);
      }}
      onClick={onActivate}
      style={{
        ...chrome,
        cursor: "pointer",
        transform: shifting
          ? SHIFT_TRANSFORM
          : flipOffset
            ? `translate3d(${flipOffset.dx}px, ${flipOffset.dy}px, 0)`
            : undefined,
        zIndex: dragging ? CHROME_LIFT_Z : chrome.zIndex,
        boxShadow: dragging ? LIFT_SHADOW : chrome.boxShadow,
        transition: [chrome.transition, slide].filter((part) => part !== "none").join(", "),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* First child so the card paints over it once it settles on top. */}
      {dragging ? (
        <span
          aria-hidden="true"
          data-ins-chrome=""
          style={{
            ...landingSlotStyle,
            transform: LANDING_TRANSFORM,
            opacity: settling ? 0 : 1,
            transition: `opacity ${SETTLE_MS}ms ${EASE}`,
          }}
        />
      ) : null}
      {children}
      <div
        style={{
          ...regionActionsStyle({ roomy: true }),
          opacity: shown ? 1 : 0,
          pointerEvents: shown ? "auto" : "none",
          transition: `opacity ${DUR_FAST} ${EASE}`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onFocus={() => setFocusWithin(true)}
        // Focus moving between the row's own buttons must not close it.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocusWithin(false);
        }}
      >
        <button
          type="button"
          onPointerDown={(e) => onGrip(index, e)}
          className={INK_BTN_CLASS}
          style={{
            ...regionActionButtonStyle({ accent: TEXT_HI, iconOnly: true }),
            cursor: dragging ? "grabbing" : "grab",
            // Without this a touch drag scrolls the page instead.
            touchAction: "none",
          }}
          title={t("core.item.reorder")}
          aria-label={t("core.item.reorder")}
        >
          <GripVertical size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
        </button>
        <PositionField
          index={index}
          total={total}
          onMoveTo={onMoveTo}
          label={t("core.item.position", { index: index + 1, total })}
          editLabel={t("core.item.moveTo")}
          className={INK_BTN_CLASS}
          style={{ ...positionStyle, width: positionBoxWidth(total) }}
          inputStyle={{ ...positionInputStyle, width: positionBoxWidth(total) }}
        >
          {index + 1}/{total}
        </PositionField>
        {/* Both arrows stay mounted, disabled at the ends: dropping one would
            resize the row and shift the others out from under the cursor. */}
        <button
          ref={backRef}
          type="button"
          onClick={onMoveBack ?? undefined}
          disabled={!onMoveBack}
          className={INK_BTN_CLASS}
          style={regionActionButtonStyle({ accent: TEXT_HI, disabled: !onMoveBack, iconOnly: true })}
          title={backLabel}
          aria-label={backLabel}
        >
          <BackIcon size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
        </button>
        <button
          ref={forwardRef}
          type="button"
          onClick={onMoveForward ?? undefined}
          disabled={!onMoveForward}
          className={INK_BTN_CLASS}
          style={regionActionButtonStyle({ accent: TEXT_HI, disabled: !onMoveForward, iconOnly: true })}
          title={forwardLabel}
          aria-label={forwardLabel}
        >
          <ForwardIcon size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
        </button>
        {/* Delete earns a rule of its own: it is the one action here that
            cannot be undone by pressing the opposite button. */}
        <span aria-hidden="true" style={inkDividerStyle} />
        <button
          type="button"
          onClick={onRemove}
          className={INK_BTN_CLASS}
          style={regionActionButtonStyle({ accent: STATUS_DANGER, iconOnly: true })}
          title={t("core.item.remove")}
          aria-label={t("core.item.remove")}
        >
          <Trash2 size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
        </button>
      </div>
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
  const t = useCmsStrings();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lit = hovered || focused;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("core.item.addLabel")}
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
        borderRadius: RING_RADIUS,
        background: lit
          ? `color-mix(in srgb, ${ACCENT} 10%, transparent)`
          : `color-mix(in srgb, ${ACCENT} 4%, transparent)`,
        // An outline, not a border: the slot mirrors a real item's footprint,
        // and a border would make it 3px larger than every card beside it.
        outline: `1.5px dashed color-mix(in srgb, ${ACCENT} ${lit ? 70 : 30}%, transparent)`,
        outlineOffset: 0,
        transition: "background-color 0.18s ease, outline-color 0.18s ease",
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
        <span>{t("core.item.add")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (kept inline; admin overlays only render in admin mode)
// ---------------------------------------------------------------------------

// Dashed like the add slot: it reads as a place something goes.
const landingSlotStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  boxSizing: "border-box",
  border: `1.5px dashed color-mix(in srgb, ${ACCENT} 55%, transparent)`,
  borderRadius: RING_RADIUS,
  background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
  pointerEvents: "none",
});

/**
 * The box the readout and the position input share.
 *
 * Sized for the widest the readout can ever get in this list ("12/12", not
 * "1/12") rather than for what it says right now, so the pill holds still both
 * when an item is dragged past ninth place and when the readout is opened for
 * typing. Figures are tabular, so a digit is exactly 1ch; the separator is
 * narrower than a digit, which is where the padding's slack comes from.
 *
 * @param {number} total
 */
function positionBoxWidth(total) {
  const digits = String(Math.max(total, 1)).length;
  return `calc(${digits * 2 + 1}ch + 10px)`;
}

// Tabular figures, not mono: the readout is a number, and with the digits
// locked to one width the counter no longer twitches as items are moved.
// `boxSizing` is explicit because the width includes the padding and the host
// page's reset is not ours to assume.
const positionStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  height: CHROME_CONTROL,
  padding: "0 5px",
  borderRadius: R_SM,
  color: TEXT,
  fontFamily: FONT_SANS,
  fontSize: FS_XS,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  "--ins-ink-fg": TEXT,
});

// The readout's own box, down to the padding, so opening the field changes the
// fill and nothing else.
const positionInputStyle = /** @type {React.CSSProperties} */ ({
  ...positionStyle,
  border: 0,
  background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
  color: "var(--ins-text, #fff)",
  textAlign: "center",
  outline: "none",
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
  fontFamily: FONT_SANS,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.02em",
  pointerEvents: "none",
  transition: "color 0.18s ease",
});

