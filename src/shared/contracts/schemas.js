/**
 * @file Backend API request/response shapes. JSDoc typedefs only, no runtime
 * exports; referenced via `@import` from other files.
 */

/**
 * Allowed values for `BlockResponse.blockType`.
 *
 * Value shapes per type:
 *   - ShortText / LongText / RichText: string. ShortText is a single-line
 *     `<input>`, LongText a `<textarea>`, RichText a formatting editor.
 *   - Image: { src, alt }
 *   - Link: { href, label }
 *   - Date: ISO 8601 string, empty string when unset.
 *   - List: array of objects shaped by the manifest's `itemSchema`. The whole
 *     list shares one `version`, so reorder/add/remove/edit save atomically.
 *   - Collection: read-only binding carrying `{ collection, slug? }`. The SDK
 *     resolves items separately and hands them to render-props; writes happen
 *     in the collection's own admin surface, not here.
 *
 * @typedef {"ShortText" | "LongText" | "RichText" | "Image" | "Link" | "Date" | "List" | "Collection"} BlockType
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
 *   Only computed for callers holding `content:write`; omitted for read-only
 *   credentials and on the public endpoint.
 * @property {string} [_slug]
 *   SDK-stamped after fetch so the save layer knows which slug to PUT each
 *   block back to. Not part of the wire payload.
 * @property {string|null} [_group]
 *   Synthesised Collection rows only: which drawer group card the row belongs
 *   to. A content block's group is read off its path instead (the prefix
 *   `<CmsGroup>` bakes in), which a collection row's path has no room for.
 * @property {string} [_label]
 *   Synthesised Collection rows only: what the card shows instead of its
 *   `blockPath`, which addresses a record rather than a position.
 */

/**
 * Binding carried in a Collection block's `value`. Discovery never emits
 * these: `<CollectionRegion>` / `<CollectionItem>` register their binding into
 * a runtime registry on mount, and the admin drawer synthesises Collection
 * blocks from it. The SDK resolves items from the binding at render time.
 *
 * @typedef {Object} CollectionBinding
 * @property {string} collection   Backend collection key (e.g. "Teams", "News"). Case-insensitive at the API level.
 * @property {string} [slug]       When set, the block resolves a single item via `GET /cms/collections/{key}/{slug}`. Omit for list bindings (`GET /cms/collections/{key}`).
 * @property {string|null} [group] Item bindings only: the enclosing `<CmsGroup>` name, so the drawer can file the card under it.
 * @property {string} [label]      Item bindings only: what the drawer card and the page chip read.
 * @property {string} [fromRegion]
 *   Item bindings only: the region binding id this row came from. A row of a
 *   window the page already points at is reachable through that region's
 *   reference row, so the drawer skips it when synthesising Collection blocks;
 *   a `<CollectionItem>` placed directly on the page has no origin and keeps
 *   its own card.
 * @property {Record<string, *>} [filter]  List bindings only: the filter window the region declares, mirrored by the drawer's region panel.
 * @property {number} [limit]      List bindings only.
 * @property {number} [offset]     List bindings only.
 */

/**
 * Per-collection field metadata from `/cms/collections/{key}/schema` and the
 * `/cms/collections/me` envelope. Drives the schema-driven drawer form.
 *
 * Scalar types map to the obvious inputs. `ObjectArray` is the only
 * non-scalar: its value is an array of
 * objects shaped by `itemFields`, rendered as a repeatable sub-form.
 *
 * `Image` is a fixed-shape `{ src, alt }` object (like the CMS Image block):
 * `src` a Url, `alt` a ShortText, both required once the field has a value. It
 * renders an upload dropzone (`config.transport.uploadImage`) instead of a bare
 * text box.
 *
 * @typedef {"ShortText" | "LongText" | "RichText" | "Image" | "Bool" | "Url" | "StringArray" | "Date" | "Number" | "ObjectArray"} CollectionFieldType
 *
 * @typedef {Object} CollectionFieldDescriptor
 * @property {string} name
 * @property {CollectionFieldType} type
 * @property {string} label
 * @property {boolean} required
 * @property {boolean} readOnly
 * @property {boolean} computed
 *   Enrichment field: resolved from an external API at read time and never
 *   stored, so a save payload must skip it. Always `readOnly` as well, which
 *   means one `readOnly || computed` check covers both.
 * @property {boolean} filterable
 *   When true, the field can be used as a query-string filter against
 *   `GET /cms/collections/{key}?{field}={value}`. Backend rejects
 *   filtering on non-filterable fields with 400. UI uses this to gate
 *   which fields surface in filter pickers.
 * @property {boolean} sortable
 *   When true, `?sort={name}` accepts this field. Only `ShortText`, `Number`
 *   and `Date` can be sortable. Build sort pickers from this rather than a
 *   hardcoded list, since it is per collection.
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
 * @typedef {Object} CollectionListParams
 * @property {Record<string, *>} [filter]
 *   Each key is a filterable field; values are serialised as `String(value)`
 *   into the query string (booleans become `"true"`/`"false"`). Unknown or
 *   non-filterable fields trigger a 400.
 * @property {number} [offset]   Default 0.
 * @property {number} [limit]    Default 50, max 100, min 1.
 * @property {string} [locale]
 *   Narrow the list to one language. Omit on a single-language site; the
 *   backend then answers with the Client's default locale.
 * @property {string} [sort]
 *   `field` or `field:asc` / `field:desc`, default `slug:asc`. Valid keys are
 *   `slug`, `createdAt`, `updatedAt` and any field with `sortable: true`; an
 *   unknown key or direction is a 400 that names what is available. Ties always
 *   break on `slug` so paging stays stable, and rows missing the value sort
 *   last in both directions.
 * @property {boolean} [archived]
 *   `true` returns the archive in place of the live rows, and only to editors
 *   (403 otherwise). No `virtualItems` come back in this mode: a row that was
 *   never created does not belong in an archive view.
 */

/**
 * `GET /cms/collections/{key}`: one paginated window of a collection, plus the
 * rows that have no record yet.
 *
 * `total` / `offset` / `limit` describe `items` alone. `virtualItems` is not
 * paginated and comes back identical at every offset, so a paging list
 * accumulates `items` and *replaces* `virtualItems`.
 *
 * @typedef {Object} CollectionListResponse
 * @property {CollectionItemResponse[]} items
 * @property {number} total
 * @property {number} offset
 * @property {number} limit
 * @property {CollectionVirtualItem[]} [virtualItems]
 *   Editor listings only, and absent rather than empty when there are none.
 */

/**
 * A row the editor may write that has no database record behind it yet.
 *
 * Branch on `origin`, not on whether `slug` is set: the two origins publish and
 * discard through different endpoints, and `slug` alone cannot tell them apart.
 *
 *   - `"pending"` — this editor's unpublished new-item draft. One slot per
 *     (collection, locale), returned on *every* editor listing whatever the
 *     `offset`, `sort` or filters, because the slot belongs to the editor
 *     rather than to the current view. Never returned when `archived=true`.
 *     Carries no slug even for `UserDefined` collections: the draft slot does
 *     not store one, so the panel's form state is the only place it lives until
 *     publish.
 *   - `"derived"` — a claim-derived slug this caller owns but has never saved.
 *     `PUT /cms/collections/{key}/{slug}` at that same slug is what turns it
 *     into a real record.
 *
 * Every persisted field is absent, so this is deliberately not a
 * `CollectionItemResponse`: there is no row yet, so no `id` to key by and no
 * `version` to conflict on. Key virtual rows by `` `${origin}:${slug ?? ""}` ``.
 *
 * @typedef {Object} CollectionVirtualItem
 * @property {"pending" | "derived"} origin
 * @property {string} [slug]        `derived` only.
 * @property {*} data
 *   The published side: empty, but carrying any `computed` enrichment the
 *   collection resolves, so a team page can show its member count before
 *   anyone has written it.
 * @property {*|null} [draftData]   What the editor has typed but not published.
 * @property {boolean} canEdit
 * @property {string} [updatedAt]
 *   `pending` only: when the slot was last autosaved. There is no `createdAt`,
 *   since nothing has been created.
 * @property {boolean} [isArchived]
 *   `derived` only, and only when true: this slug's record exists but sits in
 *   the archive. Offer restore rather than an editor; the row would otherwise
 *   appear in no default view at all, and its owner would never learn the slug
 *   was taken down.
 */

/**
 * Row in the response of `GET /cms/collections/me`. Lists every collection
 * the requesting user can interact with (CanCreate or at least one virtual
 * slug). The drawer uses this to decide which collection tabs to open.
 *
 * @typedef {"AutoGenerated" | "ClaimDerived" | "UserDefined"} CollectionSlugSource
 *
 * @typedef {Object} MyCollectionResponse
 * @property {string} collectionKey
 * @property {CollectionSchema} schema
 * @property {boolean} canCreate
 *   When false, the user has no global create permission; the derived rows in
 *   `virtualItems` are their only way to produce new records.
 * @property {CollectionSlugSource} slugSource
 *   Decides both the create call and whether the panel shows a slug input:
 *
 *   - `AutoGenerated` — no slug input; the backend derives one from a declared
 *     field on publish. Create is `POST /cms/collections/{key}/`, and a `PUT`
 *     at a slug that does not exist is refused ("use POST to create items").
 *   - `UserDefined` — the editor types the slug; `PUT /cms/collections/{key}/{slug}`
 *     is the only write path, create and update alike. Send no version to
 *     create: at a slug that already holds a row the backend answers 400
 *     ("Version is required when writing to existing item"), which is what
 *     stops a create from overwriting someone else's record, and a stale one
 *     answers 409. The draft slot does not store the slug, so it survives a
 *     reload only in the panel's own form state.
 *   - `ClaimDerived` — no slug input either; the slug comes from the caller's
 *     claims and arrives as a `derived` entry in `virtualItems`. `PUT` at that
 *     same slug is what materialises it, and a non-administrator may do so for
 *     their own derived slugs and nothing else.
 * @property {string[]} [locales]
 *   Languages this collection holds, in the collection's own definition rather
 *   than the site's: a collection is shared, so its coverage can be narrower
 *   than the sites reading it. Empty or absent means it is not localized.
 *   First entry is the default.
 */

/**
 * One row from `GET /cms/collections/{key}` (list) or `.../{slug}` (single).
 * Backend-owned shape; `data` is the per-collection payload.
 *
 * Every row here is persisted. Rows that exist only as a claim or a draft come
 * back in `virtualItems` as `CollectionVirtualItem` instead.
 *
 * @typedef {Object} CollectionItemResponse
 * @property {string} id
 * @property {string} collectionKey
 * @property {string} slug
 *   Stable, unique-within-collection identity, and what to key rows by. Unique
 *   across the whole collection, languages included: a record and its
 *   translation are two rows with two slugs (`yeni-urun` / `new-product`),
 *   which is why every per-slug endpoint addresses one row without being told
 *   a locale.
 * @property {string} [locale]   Language this row is written in.
 * @property {string|null} [translationGroupId]
 *   The group this row belongs to. Every record gets one at creation, so a
 *   record with no translations is simply the only member of its own group.
 *   Pass it back as `translationOf` to create a sibling in another language.
 * @property {{ locale: string, slug: string }[]} [translations]
 *   The group's *other* members, one per language. Only the single-record read
 *   carries it: a list would need one lookup per row, and nothing on a list
 *   needs to know. This row's own locale and slug are not repeated here.
 *   Absent on a backend without translation support.
 * @property {*} data
 * @property {number} version
 *   Optimistic concurrency token for the *content*. Archiving and restoring
 *   deliberately leave it alone, so a tab holding the pre-archive number still
 *   holds a current one once the row comes back.
 * @property {string} [createdAt]  ISO 8601 UTC.
 * @property {string} [updatedAt]  ISO 8601 UTC.
 * @property {boolean} canEdit
 *   Whether the user can write this row through the collection's own admin
 *   surface. The CMS never writes; forwarded to render-props for
 *   "edit elsewhere" links. Per row, not per collection: on a `ClaimDerived`
 *   collection an editor owns only their own rows while an administrator owns
 *   all of them, so gate the edit affordance on this rather than recomputing
 *   the rule in the panel.
 * @property {*|null} [draftData]
 *   Admin-only overlay: this user's pending draft for (key, slug). Drawer
 *   editors seed from `draftData ?? data`. A successful publish auto-clears it
 *   server-side.
 * @property {boolean} [isArchived]
 *   Present only on an archived row, so absence means live. Writes to an
 *   archived row answer 409 with `reason: "archived"`.
 * @property {string} [archivedAt]  Present only on an archived row.
 */

/**
 * Full response of `GET /cms/content` and `GET /cms/public/{clientKey}/content`.
 *
 * @typedef {Object} ContentResponse
 * @property {string} slug
 * @property {string} [locale]
 *   Language these blocks are in, echoed back. Absent from a single-language
 *   backend, and from responses to a request that sent no `locale`.
 * @property {BlockResponse[]} blocks  Empty array if page not yet synced.
 */

/**
 * Single block in a `PUT /cms/content` request body.
 *
 * @typedef {Object} UpdateBlockItem
 * @property {string} blockPath
 * @property {*} value
 * @property {number} version  Last known version; mismatches return 409.
 * @property {string|null} [locale]
 *   Client-side routing only, and stripped before the item reaches the wire:
 *   `locale` addresses the request, so it belongs in the query string, not
 *   beside a value in the body. Set on a translation staged from the drawer,
 *   which is what makes `savePage` send it as its own PUT to that language
 *   instead of folding it into the current one's. Absent means "the route's
 *   own language".
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
 * One block the backend refused because the version sent was behind. `provided`
 * is what the client had, `expected` what the row actually holds.
 *
 * @typedef {Object} BlockConflict
 * @property {string} path
 * @property {number} expected
 * @property {number} provided
 */

/**
 * RFC 7807 error payload returned by the backend on non-2xx responses.
 *
 * The extensions are what callers should branch on rather than the `detail`
 * prose, whose wording is not a contract.
 *
 * @typedef {Object} ProblemDetails
 * @property {string|null} type
 * @property {string} title
 * @property {number} status
 * @property {string} detail
 * @property {string} instance
 * @property {BlockConflict[]} [conflicts]
 *   409 only, and only for a per-block version conflict. Absent (not empty) on
 *   a plain write race, where no block-level expectation exists.
 * @property {string} [reason]
 *   409 only: which kind of conflict this is. `"archived"` means the row was
 *   taken down rather than overtaken, so restore is the way forward and a merge
 *   screen would be the wrong answer. Absent on a plain version conflict.
 * @property {*[]} [errors]   Validation failures behind a 400.
 */

export {};