"use client";

/**
 * @file The editing half of `<CollectionField>`, reached through a dynamic
 * import so a visitor's bundle carries none of it.
 *
 * Reached only from a record scope that already has an editor attached, so by
 * the time this mounts the session and the record's `canEdit` have both been
 * settled. What is left to decide is whether *this field's type* has an
 * in-place affordance at all; the ones that do not fall back to the published
 * element the public half handed over.
 */

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useCollectionContext } from "./context.js";
import { useEditorField } from "./hooks/use-editor-values.js";
import { useCollectionItemScope } from "./item-context.js";
import { renderReadOnly, isImageValue } from "./CollectionField.jsx";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useImageOverlayFits } from "../editors/inline/use-image-overlay-fits.js";
import { InlineTextEditor } from "../editors/inline/InlineTextEditor.jsx";
import { InlineImageOverlay } from "../editors/inline/InlineImageOverlay.jsx";
import { InlineImagePlaceholder } from "../editors/inline/InlineImagePlaceholder.jsx";
import { haloInset, RING_LINE } from "../core/page-region-chrome.js";
import { RING_RADIUS } from "../shared/style/tokens.js";

// Lazy within the lazy half: Tiptap is heavier than everything around it, and
// only an admin editing a RichText field pulls the chunk.
const InlineRichText = lazy(() =>
  import("../editors/inline/InlineRichText.jsx").then((m) => ({ default: m.InlineRichText })),
);

// Field types that edit as a plain string in place.
const TEXT_TYPES = new Set(["ShortText", "LongText"]);
const EDITABLE_TYPES = new Set([...TEXT_TYPES, "RichText", "Image"]);

/**
 * @param {{
 *   name: string,
 *   as: string | undefined,
 *   html: boolean | undefined,
 *   placeholder: string | undefined,
 *   rest: Record<string, *>,
 *   readOnlyNode: React.ReactNode,
 * }} props
 */
export function CollectionFieldAdmin({ name, as, html, placeholder, rest, readOnlyNode }) {
  const { collection, slug, scopeId, editor } = useCollectionItemScope();
  const { registerInlineField, unregisterInlineField } = useCollectionContext();
  const t = useCmsStrings();
  const [isHovered, setIsHovered] = useState(false);
  const richAnchorRef = useRef(/** @type {HTMLSpanElement | null} */ (null));

  const field = editor?.schema?.fields.find((f) => f.name === name) ?? null;
  const editable = Boolean(
    editor?.canEdit && field && !field.readOnly && EDITABLE_TYPES.has(field.type),
  );

  // Claim the record's draft for the page while an editable field is mounted,
  // so the drawer's card stands down as its driver (see `inlineFieldRecords`).
  useEffect(() => {
    if (!editable) return undefined;
    registerInlineField(collection, slug, scopeId);
    return () => unregisterInlineField(collection, slug, scopeId);
  }, [editable, collection, slug, scopeId, registerInlineField, unregisterInlineField]);

  useEffect(() => {
    if (!editor?.schema || process.env.NODE_ENV === "production") return;
    if (!field) {
      // eslint-disable-next-line no-console
      console.warn(
        `[inscribed] <CollectionField name="${name}"> has no such field in "${collection}"'s schema; it renders empty.`,
      );
    } else if (field.type === "RichText" && !html) {
      // Only an admin can detect this, so say it loudly: without the flag the
      // page you are editing and the page a visitor sees disagree.
      // eslint-disable-next-line no-console
      console.warn(
        `[inscribed] <CollectionField name="${name}"> is a RichText field; pass \`html\` or visitors see its markup as text.`,
      );
    }
  }, [editor?.schema, field, html, name, collection]);

  const Tag = /** @type {*} */ (as ?? "span");
  // Subscribed to this one field, so a sibling's keystroke leaves us alone.
  const raw = useEditorField(editor?.editorId, name);

  // Patching through the store rather than spreading `editor.values` here: that
  // spread is what forced every field to hold the whole record.
  const setField = (next) => editor.setValues({ ...editor.readValues(), [name]: next });

  // Not an in-place type, or locked: the published element already renders it,
  // except that an editor's unsaved draft has to show through.
  if (!editable) return renderReadOnly({ Tag, raw, html, rest });

  if (field.type === "Image") {
    return (
      <ImageField
        value={isImageValue(raw) ? raw : null}
        onChange={setField}
        rest={rest}
      />
    );
  }

  if (field.type === "RichText") {
    return (
      // The toolbar positions itself against this box, so the editor needs a
      // stable anchor of its own rather than the record's ring.
      <span ref={richAnchorRef} style={{ display: "block" }}>
        {/* Falls back to the published markup, so the layout doesn't jump
            while the editor chunk loads. */}
        <Suspense fallback={readOnlyNode}>
          <InlineRichText
            value={typeof raw === "string" ? raw : ""}
            onChange={setField}
            anchorRef={richAnchorRef}
            style={{ cursor: "text", ...(rest.style ?? {}) }}
          />
        </Suspense>
      </span>
    );
  }

  return (
    <InlineTextEditor
      {...rest}
      tag={as ?? "span"}
      value={typeof raw === "string" ? raw : ""}
      singleLine={field.type === "ShortText"}
      placeholder={placeholder ?? t("core.text.placeholder")}
      data-collection-field={name}
      onInput={setField}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        // Same neutral hover line a region gets: without it an editable field
        // is invisible until clicked. The record's ring carries the accent, so
        // this one stays quiet.
        outline: `1px solid ${isHovered ? RING_LINE : "transparent"}`,
        outlineOffset: haloInset(false),
        borderRadius: RING_RADIUS,
        cursor: "text",
        ...(rest.style ?? {}),
      }}
    />
  );
}

/**
 * The image affordance `<EditableRegion>` uses: replace/remove ride on the
 * picture itself while hovering, and an empty field becomes a drop-zone so a
 * first picture can be added without the drawer. Alt text stays in the drawer's
 * form, which is where a text input belongs.
 *
 * @param {{
 *   value: { src: string, alt?: string } | null,
 *   onChange: (next: { src: string, alt: string }) => void,
 *   rest: Record<string, *>,
 * }} props
 */
function ImageField({ value, onChange, rest }) {
  const [isHovered, setIsHovered] = useState(false);
  const boxRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  // Same threshold as an Image block: too small for the scrim buttons and the
  // overlay stands down, leaving the drawer as the way in.
  const overlayFits = useImageOverlayFits(boxRef, Boolean(value));

  if (!value) return <InlineImagePlaceholder style={rest.style} onChange={onChange} />;

  const { style, ...imgProps } = rest;
  const { box, paint } = splitBoxStyle(style ?? {});

  return (
    <span
      ref={boxRef}
      // The overlay anchors here, so the wrapper has to take over the picture's
      // outer box: left on the image, a `width: 100%` inside a shrink-to-fit
      // wrapper would collapse to the intrinsic size for admins only.
      style={{ position: "relative", display: "inline-block", ...box }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...imgProps}
        src={value.src}
        alt={value.alt ?? ""}
        // `display: block` drops the inline-image baseline gap so the overlay
        // matches the picture exactly, same as the block-side region does.
        style={{ display: "block", width: box.width != null ? "100%" : undefined, ...paint }}
      />
      {isHovered && overlayFits ? (
        <InlineImageOverlay
          value={value}
          onChange={(next) => onChange({ ...next, alt: next.alt ?? value.alt ?? "" })}
        />
      ) : null}
    </span>
  );
}

// Properties that place the picture in the page (so they have to move to the
// wrapper) versus the ones that paint it (which stay on the <img>).
const BOX_PROPS = new Set([
  "display", "width", "maxWidth", "minWidth", "flex", "alignSelf", "gridArea",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
]);

/** @param {Record<string, *>} style */
function splitBoxStyle(style) {
  /** @type {Record<string, *>} */
  const box = {};
  /** @type {Record<string, *>} */
  const paint = {};
  for (const [k, v] of Object.entries(style)) {
    if (BOX_PROPS.has(k)) box[k] = v;
    else paint[k] = v;
  }
  return { box, paint };
}
