"use client";

/**
 * @file `AdminCollectionItemCard` - drawer-side editor for a single
 * Collection-typed block (CollectionItem binding).
 *
 * Renders the schema-driven form for one collection row. Save bypasses
 * the CMS draft system entirely: collections don't have a draft
 * endpoint yet, so we PUT directly with optimistic-concurrency version
 * tracking. 403 → no permission, 409 → version mismatch (auto-refresh),
 * 400 → validation error from the backend's schema check.
 *
 * Pulls the schema from `useMyCollections()` rather than a separate
 * /schema fetch so the drawer only round-trips for /me once per session.
 * Pulls the item value via `useCollectionItem(collection, slug)`; if
 * the same item is also rendered on the page through `<CollectionItem>`,
 * the two fetches don't currently dedupe (acceptable for Commit 1; a
 * shared cache can come later if it matters).
 */

import { useEffect, useState, useTransition } from "react";

import { useCmsContext } from "../lib/context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
import { upsertCollectionItem, CmsApiError } from "../lib/api-client.js";

import {
  CollectionFieldsForm,
  seedValues,
  buildPayload,
  requiredMissing,
} from "./editors/CollectionFieldsForm.jsx";
import { TEXT_MUTED, ACCENT } from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse } from "../lib/schemas.js"
 */

/**
 * @param {{ block: BlockResponse }} props
 */
export function AdminCollectionItemCard({ block }) {
  const binding = /** @type {{ collection?: string, slug?: string }} */ (block.value ?? {});
  const collection = binding.collection;
  const slug = binding.slug;

  if (typeof collection !== "string" || typeof slug !== "string") {
    return (
      <div style={hintStyle}>
        Bu Collection bloğu geçersiz bir bağlamaya sahip — <code>{block.blockPath}</code>{" "}
        beklenen <code>{`{ collection, slug }`}</code> şeklini taşımıyor.
      </div>
    );
  }

  return <CollectionEditor collection={collection} slug={slug} blockPath={block.blockPath} />;
}

/**
 * @param {{ collection: string, slug: string, blockPath: string }} props
 */
function CollectionEditor({ collection, slug, blockPath }) {
  const { config, getAccessToken } = useCmsContext();
  const { collections: my, isLoading: meLoading, error: meError } = useMyCollections();
  const { item, isLoading: itemLoading, error: itemError, refetch } = useCollectionItem(collection, slug);

  const meta = my.find((c) => c.collectionKey === collection) ?? null;
  const schema = meta?.schema ?? null;

  const [values, setValues] = useState(/** @type {Record<string, *> | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isPending, startTransition] = useTransition();

  // Seed local form state when both schema + item have arrived. Re-seed
  // on refetch (e.g. after a successful save reloads the row with a new
  // version) so the form reflects the latest server state.
  useEffect(() => {
    if (!schema) return;
    setValues(seedValues(schema.fields, item?.data ?? {}));
  }, [schema, item]);

  if (meLoading || itemLoading) {
    return <div style={hintStyle}>Yükleniyor…</div>;
  }
  if (meError) {
    return <div style={errorStyle}>Erişim listesi alınamadı: {meError.message}</div>;
  }
  if (itemError && !(itemError instanceof CmsApiError && itemError.isNotFound)) {
    return <div style={errorStyle}>{collection}/{slug} alınamadı: {itemError.message}</div>;
  }
  if (!schema) {
    return (
      <div style={hintStyle}>
        <code>{collection}</code> collection'ına bu oturumda erişimin yok — düzenleyemezsin.
      </div>
    );
  }
  if (!values) {
    return null;
  }

  const isVirtual = !item || item.version === 0;
  const canEdit = item?.canEdit ?? false;
  const disabled = isPending || !canEdit;

  const save = () => {
    setError(null);
    const missing = requiredMissing(schema.fields, values);
    if (missing) {
      setError(`Zorunlu alan eksik: ${missing}`);
      return;
    }
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        await upsertCollectionItem(
          config,
          collection,
          slug,
          {
            data: buildPayload(schema.fields, values),
            version: isVirtual ? null : item.version,
          },
          init,
        );
        // Item refetch picks up the new version; useEffect above re-seeds.
        await refetch();
      } catch (err) {
        if (err instanceof CmsApiError && err.isConflict) {
          setError("Versiyon çakışması — liste yenilendi, kontrol edip tekrar dene.");
          await refetch();
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError("Bu kaydı düzenleme yetkin yok.");
        } else if (err instanceof CmsApiError && err.status === 400) {
          setError(`Geçersiz veri: ${err.detail || err.message}`);
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  };

  return (
    <div style={containerStyle}>
      <div style={metaRowStyle}>
        <span style={metaLabelStyle}>{collection}</span>
        <span style={metaSlugStyle}>{slug}</span>
        <span style={metaVersionStyle}>
          {isVirtual ? "yeni" : `v${item.version}`}
        </span>
        {!canEdit ? <span style={metaReadonlyStyle}>readonly</span> : null}
      </div>

      {isVirtual && canEdit ? (
        <div style={virtualHintStyle}>
          Bu kayıt henüz yok — ilk Kaydet'te oluşturulur.
        </div>
      ) : null}

      <CollectionFieldsForm
        fields={schema.fields}
        values={values}
        onChange={setValues}
        disabled={disabled}
      />

      {error ? <div style={errorStyle}>{error}</div> : null}

      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          style={saveButtonStyle}
        >
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </button>
      ) : null}

      <input type="hidden" data-block-path={blockPath} />
    </div>
  );
}

// ---- Styles --------------------------------------------------------------

const containerStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const metaRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  letterSpacing: "0.04em",
});

const metaLabelStyle = /** @type {React.CSSProperties} */ ({
  color: ACCENT,
  textTransform: "uppercase",
});

const metaSlugStyle = /** @type {React.CSSProperties} */ ({
  color: "rgba(255,255,255,0.65)",
});

const metaVersionStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  marginLeft: "auto",
});

const metaReadonlyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textTransform: "uppercase",
  fontSize: 10,
  padding: "1px 6px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 3,
});

const virtualHintStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 12,
  color: TEXT_MUTED,
  padding: "6px 10px",
  background: "rgba(201,184,150,0.06)",
  border: "1px solid rgba(201,184,150,0.15)",
  borderRadius: 3,
});

const hintStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontSize: 12,
});

const errorStyle = /** @type {React.CSSProperties} */ ({
  color: "#ff8b8b",
  fontSize: 12,
  padding: "6px 10px",
  background: "rgba(226,100,100,0.10)",
  border: "1px solid rgba(226,100,100,0.30)",
  borderRadius: 3,
});

const saveButtonStyle = /** @type {React.CSSProperties} */ ({
  alignSelf: "flex-start",
  padding: "6px 14px",
  background: ACCENT,
  color: "#221d18",
  border: "none",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
});
