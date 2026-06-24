/**
 * @file Backend API request/response shapes. JSDoc typedefs only, no runtime
 * exports; referenced via `@import` from other files.
 */

/**
 * Allowed values for `BlockResponse.blockType`.
 *
 * Value shapes per type:
 *   - ShortText / LongText / RichText: string. ShortText is a single-line
 *     `<input>`, LongText a `<textarea>`, RichText a formatting editor. `Text`
 *     is the legacy alias of LongText; prefer the explicit names in new code.
 *   - Image: { src, alt }
 *   - Link: { href, label }
 *   - Date: ISO 8601 string, empty string when unset.
 *   - List: array of objects shaped by the manifest's `itemSchema`. The whole
 *     list shares one `version`, so reorder/add/remove/edit save atomically.
 *   - Collection: read-only binding carrying `{ collection, slug? }`. The SDK
 *     resolves items separately and hands them to render-props; writes happen
 *     in the collection's own admin surface, not here.
 *
 * @typedef {"Text" | "ShortText" | "LongText" | "RichText" | "Image" | "Link" | "Date" | "List" | "Collection"} BlockType
 */

/**
 * Per-field metadata for a List's item shape: a leaf block type plus the seed
 * value for new items. Nested lists aren't supported.
 *
 * @typedef {Object} ItemSchemaField
 * @property {Exclude<BlockType, "List" | "Collection">} blockType
 * @property {*} defaultValue
 */

/**
 * @typedef {Object<string, ItemSchemaField>} ItemSchema
 */

/**
 * Single block returned by `GET /cms/content`.
 *
 * @typedef {Object} BlockResponse
 * @property {string} blockPath  Dot-notation path, e.g. "hero.title".
 * @property {BlockType} blockType
 * @property {*} value
 *   Arbitrary JSON; shape depends on blockType. Collection blocks carry the
 *   `{ collection, slug? }` binding; resolved items are fetched at render time
 *   under their own cache tag, not stored here.
 * @property {number} sortOrder
 * @property {number} version    Used for optimistic concurrency.
 * @property {*|null} [draftValue]
 *   Admin-only overlay. Non-null when a pending draft exists: `value` is the
 *   published version, `draftValue` the draft. The backend nulls it when the
 *   two would be equal, so a non-null `draftValue` always differs from `value`.
 *   Omitted in public payloads.
 * @property {string} [_slug]
 *   SDK-stamped after fetch so the save layer knows which slug to PUT each
 *   block back to. Not part of the wire payload.
 */

/**
 * Binding stored as a Collection block's `value`, emitted by discovery from
 * `<CollectionRegion>` / `<CollectionItem>`. Stored verbatim; the SDK resolves
 * items from it at render time.
 *
 * @typedef {Object} CollectionBinding
 * @property {string} collection   Backend collection key (e.g. "Teams", "News"). Case-insensitive at the API level but discovery normalises to PascalCase.
 * @property {string} [slug]       When set, the block resolves a single item via `GET /cms/collections/{key}/{slug}`. Omit for list bindings (`GET /cms/collections/{key}`).
 */

/**
 * Per-collection field metadata from `/cms/collections/{key}/schema` and the
 * `/cms/collections/me` envelope. Drives the schema-driven drawer form.
 *
 * Scalar types map to the obvious inputs (`Text` is the legacy alias of
 * `LongText`). `ObjectArray` is the only non-scalar: its value is an array of
 * objects shaped by `itemFields`, rendered as a repeatable sub-form.
 *
 * @typedef {"Text" | "ShortText" | "LongText" | "RichText" | "Bool" | "Url" | "StringArray" | "Date" | "Number" | "ObjectArray"} CollectionFieldType
 *
 * @typedef {Object} CollectionFieldDescriptor
 * @property {string} name
 * @property {CollectionFieldType} type
 * @property {string} label
 * @property {boolean} required
 * @property {boolean} readOnly
 * @property {boolean} filterable
 *   When true, the field can be used as a query-string filter against
 *   `GET /cms/collections/{key}?{field}={value}`. Backend rejects
 *   filtering on non-filterable fields with 400. UI uses this to gate
 *   which fields surface in filter pickers.
 * @property {string[] | null} options   When non-empty, render as a select regardless of `type`.
 * @property {CollectionFieldDescriptor[] | null} itemFields
 *   Non-null only for `ObjectArray` fields: the schema for one element of the
 *   repeatable sub-form. Each entry is itself a descriptor, so nesting recurses
 *   through the same machinery. `null` on scalar fields, like `options`.
 * @property {string | null} help
 *
 * @typedef {Object} CollectionSchema
 * @property {CollectionFieldDescriptor[]} fields
 */

/**
 * Envelope returned by paginated list endpoints (currently
 * `GET /cms/collections/{key}` with optional filter + offset/limit).
 *
 * @template T
 * @typedef {Object} PagedListResponse
 * @property {T[]} items
 * @property {number} total    Total matching rows across the entire collection (not just this page).
 * @property {number} offset
 * @property {number} limit
 */

/**
 * @typedef {Object} CollectionListParams
 * @property {Record<string, *>} [filter]
 *   Each key is a filterable field; values are serialised as `String(value)`
 *   into the query string (booleans become `"true"`/`"false"`). Unknown or
 *   non-filterable fields trigger a 400.
 * @property {number} [offset]   Default 0.
 * @property {number} [limit]    Default 50, max 100, min 1.
 */

/**
 * Row in the response of `GET /cms/collections/me`. Lists every collection
 * the requesting user can interact with (CanCreate or at least one virtual
 * slug). The drawer uses this to decide which collection tabs to open.
 *
 * @typedef {"AutoGenerated" | "RoleDerived" | "UserDefined"} CollectionSlugSource
 *
 * @typedef {Object} MyCollectionResponse
 * @property {string} collectionKey
 * @property {CollectionSchema} schema
 * @property {boolean} canCreate
 *   When false, the user has no global create permission; virtual slugs
 *   (version === 0 in the list) are their only way to produce new rows.
 * @property {CollectionSlugSource} slugSource
 *   `AutoGenerated` collections accept POST creation (backend derives the
 *   slug from a designated field, e.g. `data.title` for News). `RoleDerived`
 *   collections reject POST entirely; create happens via PUT to the virtual
 *   slug that already comes back in the list response.
 */

/**
 * One row from `GET /cms/collections/{key}` (list) or `.../{slug}` (single).
 * Backend-owned shape; `data` is the per-collection payload.
 *
 * @typedef {Object} CollectionItemResponse
 * @property {string} id
 *   Persisted row id, or `Guid.Empty` for virtual rows not yet created.
 *   NOT unique across a list (many virtual rows share `Guid.Empty`), so never
 *   use it as a React key; key by `slug`.
 * @property {string} collectionKey
 * @property {string} slug
 *   Stable, unique-within-collection identity, even when `id` is `Guid.Empty`.
 *   Use this as the React key.
 * @property {*} data
 * @property {number} version
 * @property {boolean} canEdit
 *   Whether the user can write this row through the collection's own admin
 *   surface. The CMS never writes; forwarded to render-props for
 *   "edit elsewhere" links.
 * @property {*|null} [draftData]
 *   Admin-only overlay: pending draft for this user + (key, slug), or the
 *   new-item draft for virtual rows. Drawer editors seed from `draftData ??
 *   data`. A successful publish auto-clears it server-side.
 */

/**
 * Full response of `GET /cms/content` and `GET /cms/data`.
 *
 * @typedef {Object} ContentResponse
 * @property {string} slug
 * @property {BlockResponse[]} blocks  Empty array if page not yet synced.
 */

/**
 * Single block in a `PUT /cms/content` request body.
 *
 * @typedef {Object} UpdateBlockItem
 * @property {string} blockPath
 * @property {*} value
 * @property {number} version  Last known version; mismatches return 409.
 */

/**
 * Full body of `PUT /cms/content`.
 *
 * @typedef {Object} UpdatePageRequest
 * @property {string} slug
 * @property {UpdateBlockItem[]} blocks
 */

/**
 * Response of `PUT /cms/content`.
 *
 * @typedef {Object} UpdatePageResponse
 * @property {number} updated
 * @property {number} unchanged
 */

/**
 * Single block in a `POST /cms/sync` manifest entry.
 *
 * @typedef {Object} ManifestBlockItem
 * @property {string} blockPath
 * @property {BlockType} blockType
 * @property {*} defaultValue
 * @property {number} sortOrder
 * @property {ItemSchema} [itemSchema]   List blocks only - shape of one item.
 */

/**
 * One page's manifest entry. The `POST /cms/sync` body is an array of these,
 * the complete desired state: blocks/slugs absent from it are soft-deleted,
 * reappearing ones restored. An empty array marks every remote slug deleted.
 *
 * @typedef {Object} SyncManifestRequest
 * @property {string} slug
 * @property {ManifestBlockItem[]} blocks
 */

/**
 * Per-slug reconcile counts within a `POST /cms/sync` response.
 *
 * @typedef {Object} SyncSlugResult
 * @property {string} slug
 * @property {number} created      Blocks newly inserted.
 * @property {number} deleted      Blocks soft-deleted (absent from this slug's manifest).
 * @property {number} unchanged    Blocks already in sync.
 * @property {number} [restored]   Blocks un-soft-deleted because they reappeared.
 */

/**
 * Response of `POST /cms/sync` - a whole-batch reconcile summary.
 *
 * @typedef {Object} SyncResultResponse
 * @property {SyncSlugResult[]} results   Per-slug counts for every slug in the request.
 * @property {string[]} prunedSlugs       Slugs soft-deleted this run: present remotely, absent from the request.
 */

/**
 * RFC 7807 error payload returned by the backend on non-2xx responses.
 *
 * @typedef {Object} ProblemDetails
 * @property {string|null} type
 * @property {string} title
 * @property {number} status
 * @property {string} detail
 * @property {string} instance
 */

export {};