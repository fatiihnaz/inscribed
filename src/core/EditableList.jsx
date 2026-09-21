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
 *     name:  { blockType: "ShortText", defaultValue: "" },
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
 *
 * This file is the visitor's half. The item chrome, the drag-and-drop engine,
 * the add slot and the panel's wording live in `EditableListAdmin`, behind a
 * dynamic import: between them they are most of this component's weight and
 * none of it does anything without a session.
 */

import { Fragment, lazy, Suspense, useContext, useEffect, useRef } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsRoute } from "./hooks/use-cms-route.js";
import { globalsKey, routeKey } from "../shared/route.js";
import { useStoreSelector } from "../shared/state/store.js";
import { readBlock } from "./blocks.js";
import { stableStringify } from "../shared/util/stable-stringify.js";
import { useEditorVisibility } from "./hooks/use-editor-visibility.js";
import { CmsGroupContext, CmsGroupVisibilityContext, ownVisibility, strongerVisibility } from "../shared/state/group-context.js";

const EditableListAdmin = lazy(() =>
  import("./EditableListAdmin.jsx").then((m) => ({ default: m.EditableListAdmin })),
);

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

/**
 * @param {EditableListProps} props
 */
export function EditableList({ blockPath, itemSchema, children, defaultValue, scope, hidden, readOnly, noInlineAdd, editable, visible, inlineAdd = true, as, ...rest }) {
  void defaultValue; void scope; // discovery-only
  const {
    isAdmin, blocksStore, contentDraftsStore, registerItemSchema, unregisterItemSchema,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);

  // Auto-prefix under a `<CmsGroup>`, matching discovery's static rule.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Fold own `hidden`/`readOnly` with the inherited group mode, most
  // restrictive wins (see EditableRegion).
  const visibilityMode = strongerVisibility(groupVisibility, ownVisibility({ hidden, readOnly, visible, editable }));
  useEditorVisibility(fullPath, visibilityMode);
  // Either spelling switches the slot off.
  const showInlineAdd = inlineAdd && !noInlineAdd;

  // Hand the schema to the drawer so it can build the per-field item editor.
  // Keyed on the schema's *shape*, not its identity: consumers write it as an
  // inline literal, so a re-render of the parent would otherwise unregister and
  // re-register an unchanged schema and churn the drawer for nothing.
  //
  // Here rather than in the admin half, and NOT gated on `visibilityMode`: a
  // readonly list draws no chrome but still needs its schema, so the drawer can
  // render the disabled editor.
  const schemaKey = stableStringify(itemSchema);
  const itemSchemaRef = useRef(itemSchema);
  itemSchemaRef.current = itemSchema;
  useEffect(() => {
    if (!isAdmin) return undefined;
    registerItemSchema(fullPath, itemSchemaRef.current);
    return () => unregisterItemSchema(fullPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, fullPath, schemaKey, registerItemSchema, unregisterItemSchema]);

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

  const { slug, locale } = useCmsRoute();
  const key = routeKey(slug, locale);
  const globals = globalsKey(locale);
  const block = useStoreSelector(blocksStore, (s) => readBlock(s, key, globals, fullPath));
  // Precedence (as EditableRegion): local draft > backend `draftValue` >
  // published value, so a saved-but-unpublished list survives navigation.
  const raw = hasLocalDraft
    ? localDraft
    : block
      ? (block.draftValue ?? block.value)
      : undefined;
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(raw) ? raw : [];

  // Items, with no add/move/delete. What a visitor gets, what a read-only or
  // hidden list gets, and what stands in while the admin chunk loads. `as`
  // still renders, so the layout doesn't shift between public and admin.
  const plain = (
    <PlainItems items={items} as={as} rest={rest}>{children}</PlainItems>
  );

  if (!isAdmin || visibilityMode) return plain;

  return (
    <Suspense fallback={plain}>
      <EditableListAdmin
        fullPath={fullPath}
        itemSchema={itemSchema}
        items={items}
        block={block ?? null}
        hasLocalDraft={hasLocalDraft}
        localDraft={localDraft}
        showInlineAdd={showInlineAdd}
        as={as}
        rest={rest}
      >
        {children}
      </EditableListAdmin>
    </Suspense>
  );
}

/**
 * @param {{
 *   items: Record<string, *>[],
 *   as: string | undefined,
 *   rest: Record<string, *>,
 *   children: (item: Record<string, *>, index: number) => React.ReactNode,
 * }} props
 */
function PlainItems({ items, as, rest, children }) {
  const body = items.map((item, i) => (
    <Fragment key={i}>{children(item, i)}</Fragment>
  ));
  if (!as) return <>{body}</>;
  const Wrapper = /** @type {*} */ (as);
  return <Wrapper {...rest}>{body}</Wrapper>;
}
