"use client";

/**
 * @file `<EditableRegion>`: declarative primitive for editable content.
 *
 * Server-component-safe (serializable props only, no render-prop), so it drops
 * straight into a server `app/page.jsx`. The element is chosen from the block's
 * `blockType`; `as` overrides the wrapper tag and extra HTML props pass through.
 *
 * Empty/missing blocks render a single placeholder char so layout doesn't
 * collapse and admins keep a click target. Public mode is a transparent
 * passthrough; admin mode adds a click handler and hover/active outline.
 *
 * For full control over rendering, pass a function as children: the region
 * declares and wraps the block exactly the same way, but the markup is yours.
 *
 * This file is the visitor's half and stops at the rendered value. The ring,
 * the chip, the in-place editors, the panel's wording and the icon set all live
 * in `EditableRegionAdmin`, behind a dynamic import: together they are the
 * larger part of this component's graph and none of it can do anything for
 * someone who cannot edit.
 */

import { lazy, Suspense, useContext } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsRoute } from "./hooks/use-cms-route.js";
import { globalsKey, routeKey } from "../shared/route.js";
import { useStoreSelector } from "../shared/state/store.js";
import { resolveBlockValue } from "./resolve.js";
import { readBlock } from "./blocks.js";
import { useEditorVisibility } from "./hooks/use-editor-visibility.js";
import { CmsGroupContext, CmsGroupVisibilityContext, ownVisibility, strongerVisibility } from "../shared/state/group-context.js";
import { safeHref } from "../shared/util/url.js";

const EditableRegionAdmin = lazy(() =>
  import("./EditableRegionAdmin.jsx").then((m) => ({ default: m.EditableRegionAdmin })),
);

/**
 * @import { BlockType } from "../shared/contracts/schemas.js"
 */

/**
 * @typedef {Object} EditableRegionProps
 * @property {string} blockPath
 * @property {string} [as]   Wrapper tag for Text / RichText (default: "span" / "div"). Ignored for Image and Link when the block has a value.
 * @property {(value: *) => React.ReactNode} [children]
 *   Pass a function and the rendering is yours: it receives the block's
 *   effective value and whatever it returns is what the region wraps. The types
 *   that draw nothing on their own (Number, Bool, StringArray) need this, and so
 *   does any value you want laid out your own way.
 *
 *   The cost is in-place editing: a caret needs a node we produced, so a text or
 *   rich-text region handed over this way is edited in the drawer instead, and
 *   an image loses its on-image overlay. Ring, chip and drawer are unchanged.
 * @property {import("../shared/contracts/schemas.js").DeclarableBlockType} [blockType]
 *   Discovery-only metadata (read by the manifest scanner, not runtime). The
 *   scanner needs `blockType` + `defaultValue` to emit a block; omit it and the
 *   region is skipped with a warning, so it has no DB row and stays empty.
 * @property {*} [defaultValue]
 *   Discovery-only: the value seeded into the DB on first sync. Must be a static
 *   literal. Omit it and the region still syncs, seeded with "" plus a warning.
 *
 *   A plain object whose keys are all site languages seeds each one on its own
 *   (`{ tr: "Merhaba", en: "Hello" }`), and a language the map leaves out takes
 *   the first entry of `locales`. The object-valued types nest under the
 *   language (`{ tr: { src, alt } }`): `src` is not a language tag, so their own
 *   shape is never read as a map.
 * @property {"global"} [scope]
 *   Discovery-only. `"global"` writes the region to the `globalSlug` manifest
 *   entry (for header/footer/site-wide UI) so one block backs every page.
 * @property {boolean} [readOnly]
 *   The region is read-only on the page and its drawer card is locked (still
 *   shown, fields disabled). Default follows `isAdmin`.
 * @property {boolean} [hidden]
 *   The region is dropped from the drawer entirely and read-only on the page;
 *   content still ships to the public DOM, so this gates editing, not secrecy.
 *   Wins over `readOnly`. Consumed here, so it never reaches the DOM as the
 *   HTML attribute of the same name.
 * @property {boolean} [editable]
 *   Deprecated, use `readOnly`. Older, inverted spelling: `editable={false}`
 *   locks the region. Still honoured.
 * @property {boolean} [visible]
 *   Deprecated, use `hidden`. Older, inverted spelling: `visible={false}` hides
 *   the region. Still honoured.
 */

const EMPTY_PLACEHOLDER = "-";

/**
 * @param {EditableRegionProps & Record<string, *>} props
 */
// `blockType` / `defaultValue` / `scope` are discovery-only; aliased here so
// they don't leak into ...rest (onto DOM nodes) or shadow the local `blockType`.
// eslint-disable-next-line no-unused-vars
export function EditableRegion({ blockPath, as, children, hidden, readOnly, editable, visible, blockType: _bt, defaultValue: _dv, scope: _scope, ...rest }) {
  const { isAdmin, blocksStore, contentDraftsStore } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);

  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Fold in any enclosing group mode; most restrictive wins, so a region can
  // tighten but not loosen. The drawer learns it from the registration below,
  // since these props are runtime-only and never enter the manifest.
  const visibility = strongerVisibility(groupVisibility, ownVisibility({ hidden, readOnly, visible, editable }));
  useEditorVisibility(fullPath, visibility);

  // Subscribe to just this block's draft, so a keystroke elsewhere doesn't
  // re-render us. Two selectors (presence + value) so an explicit empty/null
  // draft is distinguishable from "no draft".
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  // Own block on the current route only: another block's save leaves this
  // region alone, and a navigation reads the new route's cached blocks on its
  // very first render.
  const { slug, locale } = useCmsRoute();
  const key = routeKey(slug, locale);
  const globals = globalsKey(locale);
  const block = useStoreSelector(blocksStore, (s) => readBlock(s, key, globals, fullPath));
  const blockType = block ? block.blockType : null;
  const value = resolveBlockValue(block, hasLocalDraft, localDraft);
  const empty = isValueEmpty(blockType, value);

  // A function child is the caller taking the rendering: the switch below knows
  // how a ShortText or an Image looks, and has no answer for a Number, a Bool or
  // a value someone wants laid out their own way. React never renders a bare
  // function child, so nothing legitimate is being reinterpreted here.
  const custom = typeof children === "function";
  const rendered = custom
    ? children(value)
    : empty
      ? renderPlaceholder(as, rest, isAdmin)
      : renderBlock(blockType, value, { as, ...rest });

  // A locked or hidden region draws no chrome, so it stops here too and never
  // reaches for the admin chunk.
  if (!isAdmin || visibility) return rendered;

  return (
    // The published render is the fallback, so the region shows its content
    // from the first frame and the affordances arrive with the chunk.
    <Suspense fallback={rendered}>
      <EditableRegionAdmin
        fullPath={fullPath}
        block={block ?? null}
        blockType={blockType}
        value={value}
        empty={empty}
        custom={custom}
        rendered={rendered}
        as={as}
        rest={rest}
        hasLocalDraft={hasLocalDraft}
        localDraft={localDraft}
      />
    </Suspense>
  );
}

/**
 * @param {BlockType|null} blockType
 * @param {*} value
 * @returns {boolean}
 */
export function isValueEmpty(blockType, value) {
  if (value == null) return true;
  switch (blockType) {
    case "ShortText":
    case "LongText":
    case "RichText":
      return value === "";
    case "Image":
      return !value.src;
    case "File":
      return !value.url;
    case "Link":
      return !value.href;
    case "Date":
      return value === "";
    default:
      return false;
  }
}

/**
 * Render the block's value as the right HTML element. `as` applies only to the
 * text types; Image and Link have fixed `{src,alt}` / `{href,label}` shapes.
 *
 * @param {BlockType|null} blockType
 * @param {*} value
 * @param {Record<string, *>} props
 */
function renderBlock(blockType, value, props) {
  const { as, ...rest } = props;
  switch (blockType) {
    case "ShortText": {
      const Tag = as ?? "span";
      return <Tag {...rest}>{value}</Tag>;
    }
    case "LongText": {
      const Tag = as ?? "span";
      // Multi-line is the whole point of the type, and the default `normal`
      // collapses the newlines the editor stores. A consumer `style` still wins.
      return <Tag {...rest} style={{ whiteSpace: "pre-wrap", ...rest.style }}>{value}</Tag>;
    }
    case "RichText": {
      const Tag = as ?? "div";
      // RichText is a Tiptap-produced HTML string. Sanitise on every render
      // (SSR + client) so hostile pasted markup can't XSS public visitors.
      // `isomorphic-dompurify` uses jsdom on Node, DOMPurify on the client.
      return (
        <Tag
          {...rest}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
        />
      );
    }
    case "Image":
      return <img {...rest} src={value.src} alt={value.alt ?? ""} />;
    // No `download` attribute: it is ignored cross-origin, which is where every
    // uploaded file lives, so promising a save the browser will not perform is
    // worse than an ordinary link. A consumer wanting more than an anchor (an
    // icon, the size, a viewer) passes a function child.
    case "File": {
      const href = safeHref(value.url);
      return (
        <a {...rest} href={href}>
          {value.name || value.url}
        </a>
      );
    }
    case "Link": {
      const href = safeHref(value.href);
      return (
        <a {...rest} href={href}>
          {value.label ?? value.href}
        </a>
      );
    }
    default: {
      const Tag = as ?? "span";
      return <Tag {...rest}>{typeof value === "string" ? value : null}</Tag>;
    }
  }
}

/**
 * Single placeholder for every empty/missing block. Always renders `as` (or
 * `<span>`) to avoid broken src-less `<img>`/`<a>` nodes. The dash marker is
 * an editing affordance (find-and-click an empty region), so only admins see
 * it; public visitors get the empty element with layout intact.
 *
 * @param {string|undefined} as
 * @param {Record<string, *>} rest
 * @param {boolean} isAdmin
 */
function renderPlaceholder(as, rest, isAdmin) {
  const Tag = as ?? "span";
  return <Tag {...rest}>{isAdmin ? EMPTY_PLACEHOLDER : null}</Tag>;
}
