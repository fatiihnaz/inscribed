"use client";

/**
 * @file `<CollectionField>`: one field of the enclosing `<CollectionItem>`'s
 * record, edited where it renders instead of in the drawer.
 *
 *   <CollectionItem collection="News" slug={slug}>
 *     {(item, { isLoading }) => isLoading ? <Skeleton /> : (
 *       <article>
 *         <CollectionField name="title" as="h1" style={titleStyle} />
 *         <CollectionField name="summary" as="p" style={summaryStyle} />
 *       </article>
 *     )}
 *   </CollectionItem>
 *
 * Text fields (ShortText / LongText / RichText) get the same in-place editors
 * `<EditableRegion>` uses, and `Image` the same hover overlay and drop-zone.
 * Any other field type renders read-only and keeps its drawer editor: a date
 * picker or a repeatable sub-form has no sensible in-place affordance.
 *
 * The element renders identically for visitors, so a page reads the same
 * signed in or out. It has to: the field's type comes from `/me`, which is
 * admin-only, so nothing that renders for a visitor may depend on knowing it.
 * Text and `{ src, alt }` are recognisable without the schema; markup is not,
 * which is the whole job of the `html` prop.
 */

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCollectionContext } from "./context.js";
import { useEditorField } from "./hooks/use-collection-editor.js";
import { useCollectionItemScope } from "./item-context.js";
import { useImageOverlayFits } from "../editors/inline/use-image-overlay-fits.js";
import { InlineTextEditor } from "../editors/inline/InlineTextEditor.jsx";
import { InlineImageOverlay } from "../editors/inline/InlineImageOverlay.jsx";
import { InlineImagePlaceholder } from "../editors/inline/InlineImagePlaceholder.jsx";
import { RING_HOVER } from "../core/page-region-chrome.js";
import { RING_RADIUS } from "../shared/style/tokens.js";

// Lazy so Tiptap never enters the public bundle: only an admin editing a
// RichText field pulls the chunk, same as the block-side region.
const InlineRichText = lazy(() =>
  import("../editors/inline/InlineRichText.jsx").then((m) => ({ default: m.InlineRichText })),
);

// Field types that edit as a plain string in place.
const TEXT_TYPES = new Set(["ShortText", "LongText"]);
const EDITABLE_TYPES = new Set([...TEXT_TYPES, "RichText", "Image"]);

/**
 * @typedef {Object} CollectionFieldProps
 * @property {string} name   Field name as declared in the collection's schema.
 * @property {string} [as]   Element to render (default "span").
 * @property {boolean} [html]
 *   The field holds markup (a `RichText` field), so render it as HTML rather
 *   than as text. Required for those: a visitor has no schema to read the type
 *   from, so without it they would see the tags while an admin saw a formatted
 *   editor. Sanitised on every render, server and client.
 * @property {string} [placeholder]  Shown while the field is empty, admin-only.
 */

/**
 * @param {CollectionFieldProps & Record<string, *>} props
 */
export function CollectionField({ name, as, html, placeholder = "Metin ekle…", ...rest }) {
  const { collection, slug, scopeId, item, editor } = useCollectionItemScope();
  const { registerInlineField, unregisterInlineField } = useCollectionContext();
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
  const edited = useEditorField(editor?.editorId, name);
  const raw = editor ? edited : item?.data?.[name];
  const readOnlyNode = renderReadOnly({ Tag, raw, html, rest });

  // Patching through the store rather than spreading `editor.values` here: that
  // spread is what forced every field to hold the whole record.
  const setField = (next) => editor.setValues({ ...editor.readValues(), [name]: next });

  if (!editable) return readOnlyNode;

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

  const value = raw;

  return (
    <InlineTextEditor
      {...rest}
      tag={as ?? "span"}
      value={typeof value === "string" ? value : ""}
      singleLine={field.type === "ShortText"}
      placeholder={placeholder}
      data-collection-field={name}
      onInput={setField}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        // Same neutral hover line a region gets: without it an editable field
        // is invisible until clicked. The record's ring carries the accent, so
        // this one stays quiet.
        boxShadow: isHovered ? RING_HOVER : undefined,
        borderRadius: RING_RADIUS,
        cursor: "text",
        ...(rest.style ?? {}),
      }}
    />
  );
}

/**
 * The element everyone sees: a visitor always, and an admin whenever the field
 * isn't one of the types that edit in place. Markup only renders as markup when
 * the caller says so, and it is sanitised on both server and client so pasted
 * HTML can't reach a visitor as script.
 *
 * @param {{ Tag: *, raw: *, html: boolean | undefined, rest: Record<string, *> }} args
 */
function renderReadOnly({ Tag, raw, html, rest }) {
  if (html) {
    const markup = typeof raw === "string" ? raw : "";
    return <Tag {...rest} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markup) }} />;
  }
  // An image is the one non-text shape recognisable without the schema, so it
  // still renders; anything else with no text form renders empty rather than
  // "[object Object]".
  if (isImageValue(raw)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} src={raw.src} alt={raw.alt ?? ""} />;
  }
  const text = typeof raw === "string" || typeof raw === "number" ? raw : null;
  return <Tag {...rest}>{text}</Tag>;
}

/** @param {*} value @returns {value is { src: string, alt?: string }} */
function isImageValue(value) {
  return Boolean(value) && typeof value === "object" && typeof value.src === "string" && value.src !== "";
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
