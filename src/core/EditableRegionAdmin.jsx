"use client";

/**
 * @file The editing half of `<EditableRegion>`, reached through a dynamic
 * import so a visitor's bundle carries none of it.
 *
 * Everything here needs a session to mean anything: the hover ring and the
 * label chip, the in-place text / rich-text / image editors, the panel's own
 * wording and the type icon set. The public half has already resolved the
 * block and rendered it, and hands that element over as `rendered`, so this
 * decides only what goes around it.
 */

import { cloneElement, lazy, Suspense, useEffect, useRef, useState } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "./hooks/use-cms-strings.js";
import { useStoreSelector } from "../shared/state/store.js";
import { isBlockDirty } from "./resolve.js";
import { useImageOverlayFits } from "../editors/inline/use-image-overlay-fits.js";
import { useContentRadius } from "./hooks/use-content-radius.js";
import { ACCENT } from "../shared/style/tokens.js";
import { typeIconFor } from "../shared/style/icons.jsx";
import {
  BLOCK_TAGS,
  CHROME_ICON,
  INK_CHIP_CLASS,
  ensureInkChromeStyle,
  haloInset,
  regionBoxStyle,
  regionChipStyle,
  chipDirtyDotStyle,
} from "./page-region-chrome.js";
import { InlineTextEditor } from "../editors/inline/InlineTextEditor.jsx";
import { InlineImageOverlay } from "../editors/inline/InlineImageOverlay.jsx";
import { InlineImagePlaceholder } from "../editors/inline/InlineImagePlaceholder.jsx";

// Lazy within the lazy half: Tiptap is heavier than the rest of this chunk put
// together, and only an admin who actually has a RichText region on the page
// needs it (already warmed by the drawer's prefetch).
const InlineRichText = lazy(() =>
  import("../editors/inline/InlineRichText.jsx").then((m) => ({ default: m.InlineRichText })),
);

// Block types that edit in place as a plain string. Everything else keeps the
// click-to-drawer flow (structured editors, RichText via Tiptap).
const INLINE_TEXT_TYPES = new Set(["ShortText", "LongText"]);

/**
 * @param {{
 *   fullPath: string,
 *   block: import("../shared/contracts/schemas.js").BlockResponse | null,
 *   blockType: string | null,
 *   value: *,
 *   empty: boolean,
 *   custom: boolean,
 *   rendered: *,
 *   as: string | undefined,
 *   rest: Record<string, *>,
 *   hasLocalDraft: boolean,
 *   localDraft: *,
 * }} props
 */
export function EditableRegionAdmin({
  fullPath, block, blockType, value, empty, custom, rendered, as, rest,
  hasLocalDraft, localDraft,
}) {
  const { uiStore, setActiveBlock, setDraft } = useCmsContext();
  const t = useCmsStrings();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef(/** @type {HTMLSpanElement | null} */ (null));

  useEffect(() => {
    ensureInkChromeStyle();
  }, []);

  // Selection as a boolean, so another block's selection leaves this alone.
  const isActive = useStoreSelector(uiStore, (s) => s.activeBlock === fullPath);

  const isImageType = !custom && blockType === "Image";

  // Stand the on-image overlay down when the picture is too small to hold the
  // scrim buttons. Image only, and never over markup we did not draw.
  const imageOverlayFits = useImageOverlayFits(wrapperRef, isImageType);

  // Images are a box the visitor can see, so the ring has to take their shape:
  // a boxy ring around a circular avatar, or a rounded one cutting across a
  // square photo's corners, both read as a mistake. Text has no visible box, so
  // it keeps the house radius.
  const contentRadius = useContentRadius(wrapperRef, isImageType);

  // Editing focus and drawer selection are decoupled: focusing an in-place text
  // block highlights the region but does NOT open the drawer. Both drive the
  // "active" ring/tint; only the label chip opens the drawer.
  const highlight = isActive || isFocused;
  // Everything the type switch offers is off once the caller renders: there is
  // no node we can put a caret in, and no image to hang an overlay on.
  const canInlineEdit = !custom && INLINE_TEXT_TYPES.has(/** @type {string} */ (blockType));

  const dirty = isBlockDirty(block, hasLocalDraft, localDraft);
  const TypeBadge = typeIconFor(blockType);

  let inner;
  let innerTag;
  // Lift an Image's consumer margin onto the wrapper so the overlay anchors to
  // the picture, not the margin box (else its buttons float above the image).
  let wrapperMargin = null;
  if (custom) {
    // The children are the caller's, links and buttons included, so the region
    // takes no click of its own: the chip is the way into the drawer.
    inner = rendered;
    innerTag = as ?? "div";
  } else if (canInlineEdit) {
    innerTag = as ?? "span";
    inner = (
      <InlineTextEditor
        {...rest}
        tag={innerTag}
        value={typeof value === "string" ? value : ""}
        singleLine={blockType !== "LongText"}
        placeholder={t("core.text.placeholder")}
        data-block={fullPath}
        data-cms-active={highlight || undefined}
        onInput={(text) => setDraft(fullPath, text)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ ...rest.style, cursor: "text" }}
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
          // The bar rides the ring line, which is painted outside the content
          // box; without the inset it centres on the box instead and lands on
          // the first line of prose.
          ringInset={haloInset(BLOCK_TAGS.has(innerTag))}
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
  // Full halo only for block-level text/rich; images stay tight (the overlay
  // anchors to the image) and inline keeps a hair (no mid-sentence crowding).
  const roomy = wrapperDisplay === "block" && !isImageType;
  // An image is a box the visitor can see, so its chip rides the ring line the
  // way a block-level region's does, even though the halo stays tight. Only
  // inline text keeps clear of the content, where a straddling chip would sit
  // on the sentence.
  const straddle = roomy || isImageType;

  return (
    <span
      ref={wrapperRef}
      style={{
        ...regionBoxStyle({
          display: wrapperDisplay,
          roomy,
          highlight,
          hovered: isHovered,
          accent: ACCENT,
          radius: contentRadius,
        }),
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
          title={t("core.chip.open")}
          aria-label={t("core.chip.openBlock", { path: fullPath })}
          className={INK_CHIP_CLASS}
          style={regionChipStyle({ roomy, straddle, highlight, accent: ACCENT })}
        >
          <TypeBadge size={CHROME_ICON} style={{ flexShrink: 0, opacity: 0.8 }} />
          {fullPath}
          {dirty && (
            <span
              aria-label={t("block.unsavedDot")}
              style={chipDirtyDotStyle}
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
