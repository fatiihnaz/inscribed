"use client";

/**
 * @file `AdminCollectionItemCard` - drawer Page-tab body for a single
 * Collection block (CollectionItem binding rendered on the current page).
 *
 * Thin adapter around `AdminCollectionEditor`: pulls `{ collection, slug }`
 * out of `block.value` and forwards. The shared editor owns the schema
 * lookup, fetch, save, and visual layout.
 */

import { AdminCollectionEditor } from "./AdminCollectionEditor.jsx";

/**
 * @import { BlockResponse } from "../lib/schemas.js"
 */

/**
 * @param {{ block: BlockResponse }} props
 */
export function AdminCollectionItemCard({ block }) {
  const binding = /** @type {{ collection?: string, slug?: string }} */ (block.value ?? {});
  const { collection, slug } = binding;

  if (typeof collection !== "string" || typeof slug !== "string") {
    return (
      <div style={hintStyle}>
        Bu Collection bloğu geçersiz bir bağlamaya sahip — <code>{block.blockPath}</code>{" "}
        beklenen <code>{`{ collection, slug }`}</code> şeklini taşımıyor.
      </div>
    );
  }

  return <AdminCollectionEditor collection={collection} slug={slug} />;
}

const hintStyle = /** @type {React.CSSProperties} */ ({
  color: "rgba(255,255,255,0.40)",
  fontSize: 12,
});
