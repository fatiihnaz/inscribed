# Contributing to inscribed

Thanks for your interest in contributing. This guide covers the development
setup, the build and test workflow, the architecture you'll be working within,
and the conventions we follow. Please read it before opening a pull request.

## Table of contents

- [Philosophy](#philosophy)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Project layout](#project-layout)
- [Build](#build)
- [Type declarations](#type-declarations)
- [Testing](#testing)
- [Code style & conventions](#code-style--conventions)
- [Working with the seams](#working-with-the-seams)
- [Common tasks](#common-tasks)
- [Commit conventions](#commit-conventions)
- [Pull requests](#pull-requests)
- [Releasing](#releasing)
- [License of contributions](#license-of-contributions)

## Philosophy

A few principles shape almost every decision in this codebase. Keep them in mind
and most "where should this go?" questions answer themselves.

- **Vendor-neutral core.** The core depends on no backend and no auth library.
  Anything backend- or auth-specific goes behind an injection seam with a default
  in `src/defaults/`. If you find yourself importing a vendor SDK into
  `src/shared/` or `src/core/`, stop; it belongs behind a seam.
- **Imports only ever point down.** The client source is stacked in five layers,
  lowest first: `shared`, `editors`, `core`, `collections`, `admin`. Each may
  import its own layer and anything below it, never above. So the drawer can
  reach the collections namespace, but nothing in `core/` may reach the drawer,
  and `shared/` may reach nothing at all. This is what keeps collections opt-in
  and the drawer out of a public visitor's bundle. The tell: you needed a style
  object, a hook, or a type from a layer above; move the shared piece down
  rather than importing upward. See [Project layout](#project-layout) for the
  one sanctioned exception.
- **The RSC boundary is sacred.** Functions can't be serialized across the React
  Server → Client boundary. Config objects that cross it (props) must stay
  serializable; anything holding functions (transport, service token) is resolved
  at the use site on each side. Breaking this throws
  _"Functions cannot be passed directly to Client Components"_ at runtime.
- **Server-only vs client-only is explicit.** Client code lives behind the
  `inscribed` entry's `"use client"` boundary; server code lives under
  `inscribed/server` and `inscribed/page`. Never import server modules from client code.
- **Context carries seams, stores carry state.** A provider's context value holds
  stores and callbacks whose identity never changes. Anything that *moves*
  (drafts, caches, registries, editor form values) lives in an external store and
  is read with `useStoreSelector`, so a write re-renders only the components
  selecting that slice. The tell: you added a `useState` whose value ends up in a
  context value, and now every consumer on the page re-renders on each change.
  `tests/core/cms-context-split.test.jsx` and
  `tests/collections/context-split.test.jsx` are render-count guards and fail
  loudly when state migrates back.
- **One rule, one home.** Value precedence (`core/resolve.js`), dirty state
  (`admin/dirty.js`), block merging (`core/merge-blocks.js`), list params
  (`collections/params.js`) and draft scheduling (`shared/state/draft-queue.js`)
  each live in exactly one module. They were previously hand-written at a dozen
  call sites and had already drifted into disagreeing spellings. If you are
  about to write `draftValue ?? value`, import it instead.
- **JavaScript + JSDoc, not TypeScript source.** We author `.js`/`.jsx` with JSDoc
  type annotations and emit `.d.ts` from them. There is no `.ts` source.

## Prerequisites

- **Node.js 18+**
- **npm** (the repo uses `package-lock.json`)

The package is ESM-only (`"type": "module"`).

## Getting started

```bash
git clone https://github.com/fatiihnaz/inscribed.git
cd inscribed
npm install
npm run build    # produce dist/
npm test         # run the unit suite
```

To iterate against a real app, use `npm run dev` (tsup in watch mode) and link the
package into a consuming Next.js project (`npm link`, a workspace, or a local
`file:` dependency).

## Project layout

```
src/
  index.js               # `inscribed` (client entry, "use client" lives here)
  collections.js         # `inscribed/collections` (opt-in collection entry, "use client")
  shared/                # everything above depends on this; it depends on nothing
    config.js            #   createCmsConfig / ensureCmsConfig (serializable config)
    route.js             #   pathname -> { locale, slug }: cache key vs wire identity
    contracts/           #   injection seams + backend shapes, typedefs only
      transport.js       #     CmsTransport contract
      service-token.js   #     ServiceTokenProvider contract
      auth.js            #     CmsAuthAdapter contract
      schemas.js         #     backend request/response typedefs
      errors.js          #     CmsApiError, the shape every transport throws
    state/               #   the store primitive and the contexts read across layers
      store.js           #     external store (per-slice subscriptions)
      cms-context.js     #     CmsContext (core seams; state lives in its stores)
      group-context.js   #     the enclosing <CmsGroup>'s path prefix
      draft-queue.js     #     debounced, per-key-ordered lane behind every draft write
      draft-keys.js      #     queue keys, named by target endpoint rather than record
    style/
      tokens.js          #     design tokens (--ins-*), shared by drawer and page
      theme.js           #     the themeable subset + buildThemeCss
      icons.jsx          #     dependency-free Lucide subset
    util/                #   pure helpers: deep-equal, stable-stringify, list-ops
  editors/               # the field editing surfaces
    fields/              #   drawer-side editors + the blockType -> editor dispatch
    rich-text/           #   Tiptap editor and toolbar, shared by drawer and page
    inline/              #   in-place editors <EditableRegion> swaps in for admins
    use-image-upload.js  #   upload handling behind both image surfaces
  core/                  # the block editor
    CmsProvider.jsx      #   composition root (see the note below)
    EditableRegion.jsx   #   the declarative editable primitive
    EditableList.jsx     #   List-typed blocks
    CmsGroup.jsx         #   path prefixing + cascading visibility
    resolve.js           #   value precedence: local draft > server draft > published
    merge-blocks.js      #   page + global merge, shared by server and client reads
    blocks.js            #   path-based accessors over a block array/map
    hooks/               #   useCmsContent, useCmsBlock, useCmsAdmin, useCmsSave, ...
  collections/           # the opt-in collections namespace
    CollectionProvider.jsx #  owns the collection caches, drafts and bindings
    CollectionFieldsForm.jsx # schema-driven form renderer for one record
    context.js           #   CollectionContext (opt-in collection seams + store shape)
    params.js            #   one list-params builder, so every caller shares a cache key
    hooks/
      use-collection-editor.js # headless record editor: seed, mirror, autosave, publish
      use-draft-driver.js      # elects the single surface allowed to write a draft
  admin/                 # the drawer; loaded only for admins
    Drawer.jsx           #   the panel shell, lazy-loaded by CmsProvider
    drawer-styles.js     #   drawer style objects + the inline CSS string
    dirty.js             #   what carries unpublished changes (blocks and records)
    word-diff.js         #   inline diff behind the change preview
    save-error.js        #   a failed save -> the line the banner shows
    BlockConflictNotice.jsx # per-block conflict resolution on a refused save
  defaults/              # default seam implementations
    transport.js         #   createRestTransport (the /cms/* REST adapter)
    service-token.js     #   noServiceToken
    auth.js              #   publicAuth (read-only)
  server/                # SERVER ONLY
    get-content.js       #   `inscribed/server` entry
    actions.js           #   `inscribed/actions` entry ("use server")
    cms-page.jsx         #   `inscribed/page` entry (createCmsPage)
    discover.js          #   AST manifest discovery
    with-cms.js          #   the discovery root marker
  cli/
    sync.js              #   `cms-sync` binary
  tests/                 # Vitest specs, mirroring the folders above
```

Tests live under `src/tests/<layer>/` as `*.test.js`. The discovery fixtures and
snapshots sit with their only consumer, in `src/tests/server/`.

The folder order is the dependency order, so a file's path tells you what it is
allowed to import (see [Philosophy](#philosophy)). **`core/CmsProvider.jsx` is
the one sanctioned exception**: as the composition root it mounts
`collections/CollectionProvider` so apps don't have to, and `admin/Drawer`
behind `next/dynamic`. Both edges are deliberate and code-split; every other
module in `core/` imports downward only. To check a change,
`npx madge --circular --extensions js,jsx src` must stay clean.

## Build

The build is [tsup](https://tsup.egoist.dev/) (esbuild). Entry points are defined
in `tsup.config.js` and mirror the `exports` map in `package.json`:

| Entry | Source | Published as |
| ----- | ------ | ------------ |
| `index`    | `src/index.js`            | `inscribed` |
| `collections` | `src/collections.js`   | `inscribed/collections` |
| `server`   | `src/server/get-content.js` | `inscribed/server` |
| `actions`  | `src/server/actions.js`   | `inscribed/actions` |
| `page`     | `src/server/cms-page.jsx` | `inscribed/page` |
| `cli-sync` | `src/cli/sync.js`         | `cms-sync` bin |

```bash
npm run build      # one-off build → dist/
npm run dev        # watch mode
```

### Directive caveats (important)

tsup/esbuild **drops inner-file `"use client"` / `"use server"` directives** when
bundling; only the **entry file's top-level directive survives**. Consequences:

- `src/index.js` must keep its top-level `"use client"`. Every transitive `.jsx`
  it bundles becomes part of one Client Component bundle.
- `src/server/actions.js` must keep its top-level `"use server"` so Next.js treats
  each export as a Server Action.
- A directive only survives across a **package entry boundary**. This is why, for
  example, `createCmsPage` takes `Provider` and `onAfterSave` as options instead
  of importing them: importing a `"use client"` provider or `"use server"` action
  into the server entry would strip its directive during bundling.

`react`, `react-dom`, `next`, and the native `oxc-parser` are marked
`external` so they aren't bundled (tsup can't bundle the platform binary; it's
resolved from the consumer's `node_modules` at runtime).

## Type declarations

`.d.ts` files are generated from JSDoc by tsup (`dts: true`), configured via
`tsconfig.json` (`allowJs`, `declaration`, `emitDeclarationOnly`). There is no
hand-written TypeScript.

- Annotate public API with accurate JSDoc, since it _is_ the published type surface.
- Use `@typedef`, `@param`, `@returns`, and `@import { X } from "..."` for shared
  shapes. `src/shared/contracts/schemas.js` holds the backend request/response
  typedefs; reference them rather than redefining shapes inline.
- `checkJs` is currently off, but write JSDoc as if it were on; incorrect
  annotations ship as incorrect types.

## Testing

Tests run on [Vitest](https://vitest.dev/). The default environment is Node,
which covers the pure logic and the transport contract; component and hook specs
opt into jsdom per file.

```bash
npm test           # run once
npm run test:watch # watch mode
```

- Place a test under `src/tests/<layer>/` beside the layer it covers, as
  `*.test.js` (or `.test.jsx` for anything rendering).
- Keep tests in the Node environment unless you're testing a component/hook, in
  which case add a `// @vitest-environment jsdom` docblock at the top of that file.
- Cover new `shared/` and `core/` logic, and any new `CmsTransport` method
  against the contract.

## Code style & conventions

- **Match the surrounding code.** Mirror existing naming, comment density, and
  idioms in the file you're editing.
- **Comments explain _why_, not _what_.** The codebase favours substantial
  comments on non-obvious decisions (the RSC boundary, cache invalidation, store
  subscriptions). Preserve and extend that style; don't strip context.
- **Server/client hygiene.** Never import `inscribed/server`, `inscribed/page`, or any
  `src/server/**` module from client code, and vice versa. Keep browser-only
  types out of `src/shared/config.js` (it's read on both sides).
- **No functions across the RSC boundary.** Anything that becomes a prop on a
  Client Component must be serializable. Resolve function-bearing seams at the use
  site.
- **Discovery metadata must be static literals.** `blockType`, `defaultValue`,
  and `itemSchema` are read by the AST scanner, so it can't evaluate variables or
  imports.

## Working with the seams

Three injection seams keep the core vendor-neutral. Each is a contract in
`src/shared/contracts/` with a default in `src/defaults/`:

| Seam | Contract (`src/shared/contracts/`) | Default (`src/defaults/`) |
| ---- | ---------------------------------- | ------------------------- |
| Transport | `transport.js` (`CmsTransport`) | `transport.js` (`createRestTransport`) |
| Service token | `service-token.js` | `service-token.js` (`noServiceToken`) |
| Auth adapter | `auth.js` (`CmsAuthAdapter`) | `auth.js` (`publicAuth`) |
| Browser auth | `getAccessToken` prop on `CmsProvider` | `browser-auth.js` (`getBrowserAuth`), active only with `config.clientKey` |

When you add a feature that needs to talk to a backend, route it through the
transport; don't `fetch` directly from a component or hook. The REST adapter in
`defaults/transport.js` is the **only** place that knows concrete endpoint shapes,
headers, and `CmsApiError` mapping.

## Common tasks

### Add a `CmsTransport` method

1. Add the method signature to the `CmsTransport` typedef in
   `src/shared/contracts/transport.js`.
2. Implement it in `src/defaults/transport.js` (the REST adapter).
3. Call it from the relevant hook/component/server helper via `config.transport`.
4. Add a contract test in `src/tests/shared/transport.test.js`.

Keep the method's options shape consistent: `(…, opts?)` where `opts` is
`{ accessToken?, cache?, signal?, locale? }`. New per-call concerns belong in
`opts` rather than the positional signature: a custom transport that ignores one
still satisfies the contract.

### Touch anything that identifies a page

`src/shared/route.js` splits a pathname into `{ pathname, slug, locale }`, and the
distinction is load-bearing:

- **`pathname`** keys the client block cache. Two languages of one page are two
  routes and must stay two entries.
- **`slug`** is what the backend stores under, what `_slug` stamps carry, and what
  the manifest contains. It never carries a locale prefix.
- **`locale`** rides on the wire as `?locale=`, on the ISR tag, and in the draft
  lane key. It is `null` when `locales` is unconfigured, which is what keeps a
  single-language site on the pre-i18n wire.

Client code reaches all three through `useCmsRoute()` (`src/core/hooks/`); never
read `usePathname()` for an identity again. `CmsProvider` is the exception, since
it is what publishes the context, and calls `resolveCmsRoute` directly.

The manifest stays locale-agnostic on purpose: `app/[locale]/about/page.jsx`
derives the single slug `/about`, because discovery drops the leading segment
once `cms.config.js` exports `locales`. The backend fans a slug out across the
Client's locales at sync time.

### Add a block type

1. Extend the `BlockType` union and document its value shape in
   `src/shared/contracts/schemas.js`.
2. Teach `<EditableRegion>` (and discovery in `src/server/discover.js`) to render
   and recognise it.
3. Add the editor UI in `src/editors/fields/`, dispatched from `FieldEditor`.
   If the type should edit on the page too, add its in-place surface in
   `src/editors/inline/` alongside `InlineTextEditor`, `InlineRichText` and
   `InlineImageOverlay` / `InlineImagePlaceholder`, which `<EditableRegion>`
   swaps in for admins; keep heavy deps lazy (see the RichText note below).
4. Thread the `disabled` prop through the editor and honour it on every
   interactive surface. Read-only blocks (`editable={false}`, or anything inside
   a locked `<CmsGroup>`) flow a `disabled` flag down through `FieldEditor`; an
   editor that ignores it stays editable when it shouldn't. The
   `editorVisibility` registry (populated by `<EditableRegion>` /
   `<EditableList>`, consumed by the drawer) is what drives this; it follows the
   same register/unregister pattern as `itemSchemas` in `registryStore` and
   `bindings` in `collectionStore`.

Two conventions worth knowing before you add one:

- **Plain text is type-driven.** `ShortText` and `LongText`
  share one `TextEditor` via `FieldEditor`, and `Text` is a legacy
  alias of `LongText`. Collection field types mirror the same names in
  `CollectionFieldType`.
- **Lazy-load heavy editors.** If an editor pulls a large dependency (e.g.
  Tiptap), import it lazily at the point of use so it stays out of the package's
  main-entry bundle a static import leaks the chunk into `index.js` since the
  package sets no `sideEffects`. See `CollectionFieldsForm`'s RichText case.

### Add a collection field type

Collection field types are **backend-defined**: they arrive in the `/schema`
response, never through the manifest, so there's no discovery step. The frontend
only renders what the backend declares.

1. Extend `CollectionFieldType` and document its value shape in
   `src/shared/contracts/schemas.js`.
2. Add a `case` in `CollectionFieldsForm`'s `FieldInput` that renders the editor
   (`src/collections/CollectionFieldsForm.jsx`).
3. Teach the pure helpers in the same file: `defaultFor` (empty value for
   `seedValues`), `buildPayload` (only if the type isn't a plain pass-through,
   like `ObjectArray`), and `requiredMissing` (its validity rule).
4. Cover 2–3 in `src/tests/collections/fields-form.test.js`.

The backend must emit the new `type` for the editor to show; until then the field
arrives as whatever type the schema currently reports. Keep any shared editor
**portable** (neutral colours + `currentColor`, no `shared/style/tokens.js`
palette, no framer-motion) if it's reused by `<CollectionComposer>` or the CMS block side:
those surfaces render on light host pages and the drawer alike, and the
collections entry must stay framer-free. `ImageEditor` is the reference: one
component shared by the CMS Image block and the collection `Image` field.

### Write a user-facing string

Nothing the editor reads is a literal any more. A new one is two catalog entries
and a lookup.

1. Add the key to `src/shared/i18n/en/<area>.js` first: English is canonical, and
   it is also the per-key fallback every other catalog falls through to.
2. Add the Turkish to `src/shared/i18n/tr/<area>.js`. `src/tests/shared/i18n.test.js`
   fails if a stem is missing from either side, or if a `{placeholder}` differs.
3. Read it with `useCmsStrings()` in a component, or take `t` as the **last**
   parameter in a pure helper (`describeSaveError`, `humanizeCollectionError`).
   Never pass `t` down as a prop: cards are memoised and a prop would wake them.

Counted strings pass `count` and carry `_one` / `_other` in English.
**Turkish gets `_other` only** — it takes one form after a number, and a catalog
owns every form of a key it mentions, so supplying `_other` alone is what stops
English's `_one` showing through at 1.

Areas exist so the catalogs are not one file every change queues behind; keys
stay flat and globally unique, so which file a key lives in is a filing decision
and not a namespace.

Not UI copy, and not translated: `console.warn` / `console.error`, thrown
developer errors, JSDoc, and comments.

Two placement traps, both already paid for once:

- **A component invoked as a plain function cannot hold the hook.** `FieldEditor`
  is called as `FieldEditor({...})` from `BlockCard` and from inside a gated
  `.map()` in `ListEditor`, so a hook there lands in the caller's slot and the
  count varies between renders. Extract the piece that needs wording into a real
  component, as `RichTextLoading` does.
- **`CmsProvider`'s own body is above the context the hook reads.** Only
  components rendered inside `<CmsContext.Provider>` may call it.

Tests assert through the catalog (`en["conflict.label"]`), never a literal, so
they break on a bug rather than on a reword. `src/tests/admin/block-conflict.test.jsx`
is the pattern; `src/tests/admin/save-error.test.js` shows feeding a real
translator to a pure helper.

## Commit conventions

We use **[Conventional Commits](https://www.conventionalcommits.org/)** with small,
atomic commits: one logical change per commit, with a clean message.

```
<type>: <imperative summary>

feat:     a new capability
fix:      a bug fix
refactor: behaviour-preserving change
docs:     documentation only
test:     tests only
chore:    tooling / housekeeping
```

**Breaking changes:** mark the type with `!` and add a `BREAKING CHANGE:` footer
describing the break *and* the migration. Breaking changes land in a major only,
and the footer is what an upgrading consumer is left with, so write it for them:

```
feat!: rename CmsTransport.fetchPage to getContent

BREAKING CHANGE: custom transports must rename `fetchPage` to `getContent`.
```

Prefer several focused commits over one large mixed commit. Don't bundle a refactor
with a feature.

## Pull requests

1. Branch off `main`.
2. Keep the PR focused; split unrelated changes.
3. Ensure `npm run build` and `npm test` both pass.
4. Update JSDoc/types and the README when you change public API.
5. Describe the change and call out any breaking change explicitly.

## Releasing

`prepublishOnly` runs the build, and only `dist`, `LICENSE`, and `COPYING` are
published (see `files` in `package.json`). Releases bump the version per semver:
a breaking change means a major, and its `BREAKING CHANGE:` footer carries the
migration. Note what the release needs from the backend when the contract moved.

## License of contributions

By contributing, you agree that your contributions are licensed under the
project's [LGPL-3.0-or-later](./LICENSE) license.
