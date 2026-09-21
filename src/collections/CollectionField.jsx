"use client";

/**
 * @file `<CollectionField>`: one field of the enclosing `<CollectionItem>`'s
 * record, edited where it renders instead of in the drawer.
 *
 *   <CollectionItem collection="News" slug={slug}>
 *     <article>
 *       <CollectionField name="title" as="h1" style={titleStyle} />
 *       <CollectionField name="summary" as="p" style={summaryStyle} />
 *     </article>
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
 *
 * This file is that shared read-only element and nothing else. The in-place
 * editors live in `CollectionFieldAdmin`, behind a dynamic import, and are
 * reached only from a record scope that has an editor attached, which is to say
 * only for someone who can edit it.
 */

import { lazy, Suspense } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCollectionItemScope } from "./item-context.js";

const CollectionFieldAdmin = lazy(() =>
  import("./CollectionFieldAdmin.jsx").then((m) => ({ default: m.CollectionFieldAdmin })),
);

/**
 * @typedef {Object} CollectionFieldProps
 * @property {string} name   Field name as declared in the collection's schema.
 * @property {string} [as]   Element to render (default "span").
 * @property {boolean} [html]
 *   The field holds markup (a `RichText` field), so render it as HTML rather
 *   than as text. Required for those: a visitor has no schema to read the type
 *   from, so without it they would see the tags while an admin saw a formatted
 *   editor. Sanitised on every render, server and client.
 * @property {string} [placeholder]
 *   Shown while the field is empty, admin-only. Defaults to the panel's own
 *   "add text" wording, in whatever language the panel is running in.
 */

/**
 * @param {CollectionFieldProps & Record<string, *>} props
 */
export function CollectionField({ name, as, html, placeholder, ...rest }) {
  const scope = useCollectionItemScope();
  const Tag = /** @type {*} */ (as ?? "span");

  // The published value, which is what a visitor sees and what stands in while
  // the editing chunk loads. An editor's unsaved text reaches the admin half
  // through `useEditorField`, which subscribes to this one field alone.
  const published = renderReadOnly({ Tag, raw: scope.item?.data?.[name], html, rest });

  // No editor on the scope means no session, or a record this user cannot edit.
  // Either way there is nothing to load.
  if (!scope.editor) return published;

  return (
    <Suspense fallback={published}>
      <CollectionFieldAdmin
        name={name}
        as={as}
        html={html}
        placeholder={placeholder}
        rest={rest}
        readOnlyNode={published}
      />
    </Suspense>
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
export function renderReadOnly({ Tag, raw, html, rest }) {
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
export function isImageValue(value) {
  return Boolean(value) && typeof value === "object" && typeof value.src === "string" && value.src !== "";
}
