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

import { cloneElement, lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { ACCENT, ROOMY_INSET, TYPE_META } from "./admin-drawer-styles.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { InlineTextEditor } from "./InlineTextEditor.jsx";
import { InlineImageOverlay } from "./InlineImageOverlay.jsx";
import { InlineImagePlaceholder } from "./InlineImagePlaceholder.jsx";

// Lazy so Tiptap never enters the public bundle: only an admin rendering a
// RichText region triggers the chunk (already warmed by the drawer's prefetch).
const InlineRichText = lazy(() =>
  import("./InlineRichText.jsx").then((m) => ({ default: m.InlineRichText })),
);

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

// Hover shows a neutral line ring; selecting switches to the accent ring plus a
// faint tint (mirrors the reference prototype's hover -> select hierarchy).
const RING_HOVER   = "inset 0 0 0 1px rgba(127, 127, 127, 0.55)";
const RING_ACTIVE  = `0 0 0 1.5px ${ACCENT}`;
const RING_RADIUS  = 12;
const BG_OFF    = "transparent";
const BG_HOVER  = "transparent";
const BG_ACTIVE = `color-mix(in srgb, ${ACCENT} 5%, transparent)`;
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

  const dirty = block
    ? (hasLocalDraft
        ? stableStringify(localDraft) !== stableStringify(block.value)
        : block.draftValue != null)
    : false;
  const glyph = (TYPE_META[/** @type {string} */ (blockType)] ?? TYPE_META.Text).glyph;

  let inner;
  let innerTag;
  // Lift an Image's consumer margin onto the wrapper so the overlay anchors to
  // the picture, not the margin box (else its buttons float above the image).
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
        style={{ cursor: "text" }}
      />
    );
  } else if (isImageType && empty) {
    // No <img> to hover when empty: render a drop-zone so a picture can be
    // added in place. Margin lifts to the wrapper so the ring hugs the box.
    const { marginStyle, boxStyle } = liftMargin(rendered.props?.style ?? {});
    wrapperMargin = marginStyle;
    inner = (
      <InlineImagePlaceholder style={boxStyle} onChange={(v) => setDraft(fullPath, v)} />
    );
    innerTag = "div";
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
        cursor: "pointer",
      },
    });
    innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  } else if (blockType === "RichText") {
    innerTag = as ?? "div";
    inner = (
      <Suspense fallback={rendered}>
        <InlineRichText
          value={typeof value === "string" ? value : ""}
          onChange={(html) => setDraft(fullPath, html)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          anchorRef={wrapperRef}
          style={{ cursor: "text" }}
        />
      </Suspense>
    );
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
        cursor: "pointer",
      },
    });
    innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  }

  const wrapperDisplay = BLOCK_TAGS.has(innerTag) ? "block" : "inline-block";
  // Padded card only for block-level text/rich; images stay tight (the overlay
  // anchors to the image) and inline stays tight (no mid-sentence ballooning).
  const roomy = wrapperDisplay === "block" && !isImageType;

  return (
    <span
      ref={wrapperRef}
      style={{
        position: "relative",
        display: wrapperDisplay,
        boxShadow: highlight ? RING_ACTIVE : isHovered ? RING_HOVER : "none",
        backgroundColor: highlight ? BG_ACTIVE : BG_OFF,
        borderRadius: RING_RADIUS,
        transition: "box-shadow 0.15s ease, background-color 0.2s ease",
        ...(roomy ? { padding: `8px ${ROOMY_INSET}px`, marginLeft: -ROOMY_INSET, marginRight: -ROOMY_INSET } : null),
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
            left: roomy ? 8 : 0,
            // Straddle the ring line on roomy cards (sits in the padding gap);
            // float fully above on tight regions so it clears the content.
            transform: roomy ? "translateY(-50%)" : "translateY(-100%)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            border: 0,
            borderRadius: 6,
            // Translucent ink + blur (like the on-image buttons): reads lighter
            // on a bright page than a solid fill. Only the text turns accent when
            // the region is active.
            background: "color-mix(in srgb, var(--ins-bg, #1c1815) 82%, transparent)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: highlight ? ACCENT : "var(--ins-text, #fff)",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: "0.02em",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            cursor: "pointer",
            zIndex: 9999,
          }}
        >
          <span aria-hidden="true" style={{ fontWeight: 700, opacity: 0.85 }}>{glyph}</span>
          {fullPath}
          {dirty && (
            <span
              aria-label="Kaydedilmemiş değişiklik"
              style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.9 }}
            />
          )}
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

