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
 * Text fields (ShortText / LongText) get the same in-place editor
 * `<EditableRegion>` uses, and `Image` the same hover overlay and drop-zone.
 * Any other field type renders read-only and keeps its drawer editor: a date
 * picker or a repeatable sub-form has no sensible in-place affordance.
 *
 * The element renders identically for visitors, so a page reads the same
 * signed in or out. It has to: the field's type comes from `/me`, which is
 * admin-only, so nothing that renders for a visitor may depend on knowing it.
 * Text and `{ src, alt }` are both recognisable without the schema; that is
 * exactly the line this component draws.
 */

import { useEffect, useState } from "react";

import { useCollectionContext } from "../lib/collection-context.js";
import { useCollectionItemScope } from "../lib/collection-item-context.js";
import { InlineTextEditor } from "./InlineTextEditor.jsx";
import { InlineImageOverlay } from "./InlineImageOverlay.jsx";
import { InlineImagePlaceholder } from "./InlineImagePlaceholder.jsx";
import { RING_HOVER } from "./page-region-chrome.js";
import { RING_RADIUS } from "./admin-drawer-styles.js";

// Field types that edit as a plain string in place. `Text` is the legacy alias
// of `LongText`, same as on the block side.
const TEXT_TYPES = new Set(["ShortText", "LongText", "Text"]);
const EDITABLE_TYPES = new Set([...TEXT_TYPES, "Image"]);

/**
 * @typedef {Object} CollectionFieldProps
 * @property {string} name   Field name as declared in the collection's schema.
 * @property {string} [as]   Element to render (default "span").
 * @property {string} [placeholder]  Shown while the field is empty, admin-only.
 */

/**
 * @param {CollectionFieldProps & Record<string, *>} props
 */
export function CollectionField({ name, as, placeholder = "Metin ekle…", ...rest }) {
  const { collection, slug, scopeId, item, editor } = useCollectionItemScope();
  const { registerInlineField, unregisterInlineField } = useCollectionContext();
  const [isHovered, setIsHovered] = useState(false);

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
    if (!editor?.schema || field || process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line no-console
    console.warn(
      `[inscribed] <CollectionField name="${name}"> has no such field in "${collection}"'s schema; it renders empty.`,
    );
  }, [editor?.schema, field, name, collection]);

  const Tag = /** @type {*} */ (as ?? "span");
  const raw = editor ? editor.values?.[name] : item?.data?.[name];

  if (!editable) {
    // An image is the one non-text shape a visitor can recognise without the
    // schema, so it still renders; anything else with no text form renders
    // empty rather than "[object Object]".
    if (isImageValue(raw)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img {...rest} src={raw.src} alt={raw.alt ?? ""} />;
    }
    const text = typeof raw === "string" || typeof raw === "number" ? raw : null;
    return <Tag {...rest}>{text}</Tag>;
  }

  if (field.type === "Image") {
    return (
      <ImageField
        value={isImageValue(raw) ? raw : null}
        onChange={(next) => editor.setValues({ ...editor.values, [name]: next })}
        rest={rest}
      />
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
      onInput={(text) => editor.setValues({ ...editor.values, [name]: text })}
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

  if (!value) return <InlineImagePlaceholder style={rest.style} onChange={onChange} />;

  const { style, ...imgProps } = rest;
  const { box, paint } = splitBoxStyle(style ?? {});

  return (
    <span
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
      {isHovered ? (
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
