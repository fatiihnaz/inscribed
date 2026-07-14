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

import { cloneElement, useContext, useEffect, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { ACCENT, BG_RAISED, BORDER } from "./admin-drawer-styles.js";
import { InlineTextEditor } from "./InlineTextEditor.jsx";
import { InlineImageOverlay } from "./InlineImageOverlay.jsx";

// Below this the on-image scrim buttons don't fit; the block falls back to the
// label chip → drawer for editing.
const IMAGE_OVERLAY_MIN = { w: 150, h: 64 };

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

// Block types that edit in place as a plain string. Everything else keeps the
// click-to-drawer flow (structured editors, RichText via Tiptap).
const INLINE_TEXT_TYPES = new Set(["Text", "ShortText", "LongText"]);

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
    isAdmin, blocks, contentDraftsStore, activeBlock, setActiveBlock, setDraft,
    registerEditorVisibility, unregisterEditorVisibility,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [wrapperSize, setWrapperSize] = useState(
    /** @type {{ w: number, h: number } | null} */ (null),
  );
  const wrapperRef = useRef(/** @type {HTMLSpanElement | null} */ (null));

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

  // Track the rendered image's box so the on-image overlay can stand down when
  // the picture is too small to hold the scrim buttons. Admin + Image only.
  useEffect(() => {
    if (!isAdmin || blockType !== "Image") return undefined;
    const el = wrapperRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setWrapperSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isAdmin, blockType]);

  if (!isAdmin || visibilityMode) return rendered;

  const isActive = activeBlock === fullPath;
  // Editing focus and drawer selection are decoupled: focusing an in-place text
  // block highlights the region but does NOT open the drawer. Both drive the
  // "active" ring/tint; only the label chip opens the drawer.
  const highlight = isActive || isFocused;
  const canInlineEdit = INLINE_TEXT_TYPES.has(/** @type {string} */ (blockType));
  const isImageType = blockType === "Image";
  const imageOverlayFits =
    !wrapperSize || (wrapperSize.w >= IMAGE_OVERLAY_MIN.w && wrapperSize.h >= IMAGE_OVERLAY_MIN.h);

  const ringStyle = {
    boxShadow: highlight ? RING_ACTIVE : isHovered ? RING_HOVER : undefined,
    transition: "box-shadow 0.15s ease",
  };

  let inner;
  let innerTag;
  // Margin the consumer set on an Image is lifted onto the wrapper so the
  // wrapper's box hugs the picture (not the surrounding margin). Otherwise the
  // absolutely-positioned overlay anchors to the margin box and its buttons
  // float in the gap above the image.
  let wrapperMargin = null;
  if (canInlineEdit) {
    innerTag = as ?? "span";
    inner = (
      <InlineTextEditor
        {...rest}
        tag={innerTag}
        value={typeof value === "string" ? value : ""}
        singleLine={blockType !== "LongText"}
        placeholder="Metin ekle…"
        data-block={fullPath}
        data-cms-active={highlight || undefined}
        onInput={(text) => setDraft(fullPath, text)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ ...ringStyle, cursor: "text" }}
      />
    );
  } else if (isImageType) {
    // Image's quick actions (replace/remove) live in the on-image overlay
    // below; a click on the bare image opens the drawer for the details (alt,
    // URL), same as the chip.
    const childProps = rendered.props ?? {};
    const { marginStyle, boxStyle } = liftMargin(childProps.style ?? {});
    wrapperMargin = marginStyle;
    inner = cloneElement(rendered, {
      "data-block": fullPath,
      "data-cms-active": highlight || undefined,
      /** @param {React.MouseEvent} e */
      onClick: (e) => {
        if (childProps.onClick) childProps.onClick(e);
        if (e.defaultPrevented) return;
        e.stopPropagation();
        setActiveBlock(fullPath);
      },
      style: {
        // `display:block` drops the inline-image baseline gap so the wrapper
        // (and overlay) match the image height exactly.
        ...(rendered.type === "img" ? { display: "block" } : null),
        ...boxStyle,
        ...ringStyle,
        cursor: "pointer",
      },
    });
    innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  } else {
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
    inner = cloneElement(rendered, {
      "data-block": fullPath,
      "data-cms-active": isActive || undefined,
      onClick: mergedOnClick,
      style: {
        ...(childProps.style ?? {}),
        ...ringStyle,
        cursor: "pointer",
      },
    });
    innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  }

  const wrapperDisplay = BLOCK_TAGS.has(innerTag) ? "block" : "inline-block";

  return (
    <span
      ref={wrapperRef}
      style={{
        position: "relative",
        display: wrapperDisplay,
        backgroundColor: highlight ? BG_ACTIVE : isHovered ? BG_HOVER : BG_OFF,
        transition: "background-color 0.2s ease",
        ...(wrapperMargin ?? {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {inner}
      {(isHovered || highlight) && (
        <button
          type="button"
          // preventDefault keeps the caret in the inline editor when the chip is
          // clicked; stopPropagation keeps the click off the region beneath.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setActiveBlock(fullPath);
          }}
          title="Panelde aç"
          aria-label={`${fullPath} bloğunu panelde aç`}
          style={{
            position: "absolute",
            top: 0,
            right: highlight ? -2 : -1.5,
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
            cursor: "pointer",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            zIndex: 9999,
          }}
        >
          {fullPath}{blockType ? ` · ${blockType}` : ""}
        </button>
      )}
      {isImageType && !empty && imageOverlayFits && (isHovered || highlight) && (
        <InlineImageOverlay
          value={value && typeof value === "object" ? value : null}
          onChange={(v) => setDraft(fullPath, v)}
        />
      )}
    </span>
  );
}

const MARGIN_PROPS = new Set(["margin", "marginTop", "marginRight", "marginBottom", "marginLeft"]);

/**
 * Split a style object into its margin props and everything else, so the margin
 * can move to the positioned wrapper while the rest stays on the image.
 *
 * @param {Record<string, *>} style
 * @returns {{ marginStyle: Record<string, *>, boxStyle: Record<string, *> }}
 */
function liftMargin(style) {
  /** @type {Record<string, *>} */
  const marginStyle = {};
  /** @type {Record<string, *>} */
  const boxStyle = {};
  for (const [k, v] of Object.entries(style)) {
    if (MARGIN_PROPS.has(k)) marginStyle[k] = v;
    else boxStyle[k] = v;
  }
  return { marginStyle, boxStyle };
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

