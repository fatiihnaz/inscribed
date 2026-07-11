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
 * For full control over rendering, use `useCmsBlock(blockPath)` instead.
 */

import { cloneElement, useContext, useEffect, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { ACCENT, BG_RAISED, BORDER } from "./admin-drawer-styles.js";

/**
 * @import { BlockType } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} EditableRegionProps
 * @property {string} blockPath
 * @property {string} [as]   Wrapper tag for Text / RichText (default: "span" / "div"). Ignored for Image and Link when the block has a value.
 * @property {import("../lib/schemas.js").BlockType} [blockType]
 *   Discovery-only metadata (read by the manifest scanner, not runtime). The
 *   scanner needs `blockType` + `defaultValue` to emit a block; omit it and the
 *   region is skipped with a warning, so it has no DB row and stays empty.
 * @property {*} [defaultValue]
 *   Discovery-only: the value seeded into the DB on first sync. Must be a static
 *   literal. Omit it and the region still syncs, seeded with "" plus a warning.
 * @property {"global"} [scope]
 *   Discovery-only. `"global"` writes the region to the `globalSlug` manifest
 *   entry (for header/footer/site-wide UI) so one block backs every page.
 * @property {boolean} [editable]
 *   When `false`, the region is read-only on the page and its drawer card is
 *   locked (still shown, fields disabled). Default follows `isAdmin`.
 * @property {boolean} [visible]
 *   When `false`, the region is dropped from the drawer entirely and read-only
 *   on the page; content still ships to the public DOM. Wins over `editable`.
 */

const RING_HOVER   = `0 0 0 1.5px color-mix(in srgb, ${ACCENT} 30%, transparent)`;
const RING_ACTIVE  = `0 0 0 2px color-mix(in srgb, ${ACCENT} 80%, transparent)`;
const BG_OFF    = `color-mix(in srgb, ${ACCENT} 0%, transparent)`;
const BG_HOVER  = `color-mix(in srgb, ${ACCENT} 5%, transparent)`;
const BG_ACTIVE = `color-mix(in srgb, ${ACCENT} 8%, transparent)`;
const EMPTY_PLACEHOLDER = "-";

const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header", "footer", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6", "p",
  "ul", "ol", "li", "dl", "dt", "dd",
  "figure", "figcaption", "blockquote", "pre",
  "form", "fieldset", "table", "thead", "tbody", "tr", "td", "th",
]);

/**
 * @param {EditableRegionProps & Record<string, *>} props
 */
// `blockType` / `defaultValue` / `scope` are discovery-only; aliased here so
// they don't leak into ...rest (onto DOM nodes) or shadow the local `blockType`.
// eslint-disable-next-line no-unused-vars
export function EditableRegion({ blockPath, as, editable, visible, blockType: _bt, defaultValue: _dv, scope: _scope, ...rest }) {
  const {
    isAdmin, blocks, contentDraftsStore, activeBlock, setActiveBlock,
    registerEditorVisibility, unregisterEditorVisibility,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  const [isHovered, setIsHovered] = useState(false);

  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Register the `visible`/`editable` override with the drawer, folding in any
  // enclosing group mode (most restrictive wins; a region can tighten but not
  // loosen). Admin-only, so public visitors skip the churn.
  const ownMode = visible === false ? "hidden" : editable === false ? "readonly" : null;
  const visibilityMode = strongerVisibility(groupVisibility, ownMode);
  useEffect(() => {
    if (!isAdmin || !visibilityMode) return undefined;
    registerEditorVisibility(fullPath, visibilityMode);
    return () => unregisterEditorVisibility(fullPath);
  }, [isAdmin, fullPath, visibilityMode, registerEditorVisibility, unregisterEditorVisibility]);

  // Subscribe to just this block's draft, so a keystroke elsewhere doesn't
  // re-render us. Two selectors (presence + value) so an explicit empty/null
  // draft is distinguishable from "no draft".
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  const block = blocks.get(fullPath);
  const blockType = block ? block.blockType : null;
  const value = hasLocalDraft ? localDraft : block ? (block.draftValue ?? block.value) : undefined;
  const empty = isValueEmpty(blockType, value);

  const rendered = empty
    ? renderPlaceholder(as, rest, isAdmin)
    : renderBlock(blockType, value, { as, ...rest });

  if (!isAdmin || visibilityMode) return rendered;

  const isActive = activeBlock === fullPath;
  /** @param {React.MouseEvent} e */
  const handleClick = (e) => {
    e.stopPropagation();
    setActiveBlock(fullPath);
  };

  const childProps = rendered.props ?? {};
  const mergedOnClick = childProps.onClick
    ? /** @param {React.MouseEvent} e */ (e) => {
        childProps.onClick(e);
        if (!e.defaultPrevented) handleClick(e);
      }
    : handleClick;

  const cloned = cloneElement(rendered, {
    "data-block": fullPath,
    "data-cms-active": isActive || undefined,
    onClick: mergedOnClick,
    style: {
      ...(childProps.style ?? {}),
      boxShadow: isActive ? RING_ACTIVE : isHovered ? RING_HOVER : undefined,
      transition: "box-shadow 0.15s ease",
      cursor: "pointer",
    },
  });

  const innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  const wrapperDisplay = BLOCK_TAGS.has(innerTag) ? "block" : "inline-block";

  return (
    <span
      style={{
        position: "relative",
        display: wrapperDisplay,
        backgroundColor: isActive ? BG_ACTIVE : isHovered ? BG_HOVER : BG_OFF,
        transition: "background-color 0.2s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {cloned}
      {(isHovered || isActive) && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: isActive ? -2 : -1.5,
            transform: "translateY(-100%)",
            background: BG_RAISED,
            border: `1px solid ${BORDER}`,
            borderBottom: "none",
            borderRadius: "4px 4px 0 0",
            padding: "1px 6px",
            fontSize: 9,
            fontWeight: 500,
            color: `color-mix(in srgb, ${ACCENT} 65%, transparent)`,
            letterSpacing: "0.05em",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            zIndex: 9999,
          }}
        >
          {fullPath}{blockType ? ` · ${blockType}` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * @param {BlockType|null} blockType
 * @param {*} value
 * @returns {boolean}
 */
function isValueEmpty(blockType, value) {
  if (value == null) return true;
  switch (blockType) {
    case "Text":
    case "ShortText":
    case "LongText":
    case "RichText":
      return value === "";
    case "Image":
      return !value.src;
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
    case "Text":
    case "ShortText":
    case "LongText": {
      const Tag = as ?? "span";
      return <Tag {...rest}>{value}</Tag>;
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

// Block `javascript:`/`data:`/`vbscript:` URLs on Link blocks: whitelist
// common schemes + relative/anchor forms, anything else becomes "" (inert).
const HREF_ALLOWED = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;

/** @param {*} href */
function safeHref(href) {
  if (typeof href !== "string") return "";
  const trimmed = href.trim();
  return HREF_ALLOWED.test(trimmed) ? trimmed : "";
}

