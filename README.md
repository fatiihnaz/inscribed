# inscribed

[![npm version](https://img.shields.io/npm/v/inscribed.svg)](https://www.npmjs.com/package/inscribed)
[![license](https://img.shields.io/npm/l/inscribed.svg)](./LICENSE)

**Zero-Configuration, JSX-First Inline-Editing CMS SDK for Next.js App Router.**

inscribed lets you mark up regions of your existing React tree as editable, then edit
them in place, directly on the page and from an admin drawer, allowing no separate
CMS dashboard and no content modelling ceremony. The content you author in JSX _is_ the schema. A discovery
step walks your `app/` directory, registers every editable region with your
backend, and the same components render live content for visitors and an
inline editor for admins.

The core is **backend-agnostic**. Everything that talks to a server goes through
a small `CmsTransport` contract; a REST adapter ships as the default, but you can
point inscribed at any backend (your own API, Strapi, Sanity, a database, a mock) by
implementing that interface. See [Bring your own backend](#bring-your-own-backend).

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [Authoring & discovery](#authoring--discovery)
  - [Slugs](#slugs)
  - [Blocks & block types](#blocks--block-types)
  - [Groups](#groups)
  - [Lists](#lists)
  - [Collections](#collections)
  - [Editing & drafts](#editing--drafts)
  - [Localization](#localization)
  - [Theming](#theming)
  - [Panel language](#panel-language)
  - [Access control](#access-control)
  - [Caching & revalidation](#caching--revalidation)
- [Architecture: the seams](#architecture-the-seams)
- [Bring your own backend](#bring-your-own-backend)
- [Package entry points](#package-entry-points)
- [CLI: `cms-sync`](#cli-cms-sync)
- [TypeScript](#typescript)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **In-place editing.** Visitors see content; admins edit it directly on the
  page, type into text, format RichText with a floating toolbar, swap images on
  the image, backed by a side drawer for structured types and block details. No
  context switch to a dashboard.
- **JSX-first content model.** Declare editable regions with `<EditableRegion>`,
  `<EditableList>`, `<CmsGroup>`. The structure of your components is the
  content schema.
- **Static discovery.** A CLI (`cms-sync`) AST-scans your `app/` directory and
  registers a manifest of every region with your backend. It is idempotent, fits in a
  `predev` / `prebuild` hook.
- **Rich content types.** Short/long plain text, RichText (Tiptap), Image, Link,
  Date, repeatable Lists, and bindings into collections of structured records.
- **App Router native.** Server Components fetch content (ISR-cacheable),
  Client Components edit it, Server Actions revalidate it. SSR-seeded, no
  layout-shift flicker. Collections fetch on the server too and stream behind
  their own Suspense boundary, so a slow one never holds up the page.
- **Draft autosave.** Edits debounce to a draft endpoint as you type; publish is
  an explicit save.
- **Backend-agnostic core.** A single `CmsTransport` seam isolates all data
  access. A REST adapter is the default; swap it for any backend.
- **Auth-agnostic core.** Session, admin detection, and access tokens are
  injected callbacks. The core ships a public read-only default and depends on no
  auth library.

## Requirements

inscribed is a peer of your app's framework runtime:

| Peer dependency | Supported range             |
| --------------- | --------------------------- |
| `next`          | `^14.0 \|\| ^15.0 \|\| ^16.0` |
| `react`         | `^18.0 \|\| ^19.0`            |
| `react-dom`     | `^18.0 \|\| ^19.0`            |

Node 18+ for the `cms-sync` CLI. The package is ESM-only.

**Backend contract.** 4.x talks to a backend that serves
`/cms/public/{clientKey}/content`, issues `content:*` capabilities, accepts the
whole manifest at `POST /cms/sync`, and exposes the draft-discard `DELETE`
endpoints. An older backend answers some of those with 404 and the drawer will
not mount for editors. See [Bring your own backend](#bring-your-own-backend)
for the full surface.

[Localization](#localization) additionally needs a backend that stores content
per locale and accepts `?locale=` on the content and collection endpoints. It is
opt-in: leave `locales` unset and no `locale` is ever sent, so a backend that
knows nothing about languages keeps working unchanged.

## Installation

```bash
npm install inscribed
```

## Quick start

The minimal path is a **public, read-only** site: content renders for everyone,
editing is wired separately once auth is in place (see
[Editing & drafts](#editing--drafts)).

### 1. Create a config

`createCmsConfig` returns a plain, serializable object and it is safe to pass across
the Server → Client boundary.

```js
// app/lib/cms-config.js
// Server entry on purpose: this file is imported by Server Components, and
// the "inscribed" client entry would make the factory uncallable there.
import { createCmsConfig } from "inscribed/page";

export const cmsConfig = createCmsConfig({
  baseUrl: process.env.CMS_URL,          // backend root, no trailing slash
  cdnUrl: process.env.CMS_CDN_URL,       // optional: image-upload root
  clientKey: process.env.CMS_CLIENT_KEY, // optional: this site's Client key on the reference backend; enables built-in auth + anonymous published reads
  // globalSlug: "__global",             // optional: slug for site-wide blocks
  // theme: { accent: "#3b82f6" },       // optional: override the panel palette (see Theming)
});
```

### 2. Add the pathname middleware

`createCmsPage` resolves the current page slug from an `x-pathname` request
header so you can wrap your root layout once and let every static page inherit
it. Populate the header with a tiny middleware:

```js
// middleware.js
import { NextResponse } from "next/server";

export function middleware(req) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
```

Whatever your `matcher` excludes gets no header, and a `<CmsPage>` that gets
neither a header nor a `slug` falls back to `/`, which means every page reads
the same blocks. In development it warns once per process, but only for a real
page request: an excluded path that 404s (`/favicon.ico` on a site that ships no
icon) renders not-found through your **root layout** and reaches `<CmsPage>` the
same way, and that case is harmless enough to stay quiet.

### 3. Build a page factory

`createCmsPage` centralises the per-page boilerplate: it fetches the page's
blocks server-side, resolves the session, and renders your provider.

```jsx
// app/lib/cms.jsx
import { createCmsPage } from "inscribed/page";
import { CmsProvider } from "inscribed";

import { cmsConfig } from "./cms-config.js";

export const { CmsPage } = createCmsPage({
  config: cmsConfig,
  Provider: CmsProvider,
  // Public read-only by default. Add getSession / deriveAdmin / onAfterSave
  // and a getServiceToken provider to enable editing - see "Editing & drafts".
  // Add `collections` to get the server-rendered binding components too, see
  // "Collections".
});
```

### 4. Wrap the layout and author content

```jsx
// app/page.jsx  (a Server Component)
import { CmsPage } from "./lib/cms.jsx";
import { EditableRegion } from "inscribed";

export default function Home() {
  return (
    <CmsPage slug="/">
      <main>
        <EditableRegion
          blockPath="hero.title"
          as="h1"
          blockType="ShortText"
          defaultValue="Welcome"
        />
        <EditableRegion
          blockPath="hero.body"
          as="p"
          blockType="RichText"
          defaultValue="<p>Edit me.</p>"
        />
      </main>
    </CmsPage>
  );
}
```

`blockType` and `defaultValue` are **discovery-time metadata** read by the sync
CLI, ignored at runtime. They tell inscribed what kind of editor to show and what to
seed the database row with.

There is **no marker to add**: every `page.{js,jsx,ts,tsx}` under `app/` is a
**discovery root**, and its slug comes from its own path, so `cms-sync` already
knows this file owns the regions reachable from it (this file plus everything it
imports). See [Slugs](#slugs) for the derivation rules.

### 5. Register the manifest

Run the discovery + sync once so the backend knows about your regions. Wire it
into your scripts so it stays in sync with the code:

```jsonc
// package.json
{
  "scripts": {
    "predev": "cms-sync",
    "prebuild": "cms-sync"
  }
}
```

That's the full read path: visitors get server-rendered, ISR-cacheable content.
Editing is the same components plus an auth adapter covered next.

---

## Core concepts

### Authoring & discovery

inscribed has no schema file. You declare editable regions inline in your JSX and a
static discovery step turns those declarations into a backend manifest.

- **Declare** regions with `<EditableRegion>` / `<EditableList>`, each carrying
  `blockType` + `defaultValue` literals. (`<CollectionRegion>` /
  `<CollectionItem>` bindings are runtime-only and never enter the manifest;
  see [Collections](#collections).)
- **Root** nothing by hand: every `page.{js,jsx,ts,tsx}` under `app/` is a
  discovery root, and its slug is derived from its path (see
  [Slugs](#slugs)). The scanner starts at each page file, follows relative
  imports from there, and files each reachable region under that page's slug.
- **Discover** by running `cms-sync`. It AST-scans `app/`, follows relative
  imports and jsconfig/tsconfig `paths` aliases, with or without `baseUrl` (also
  into files outside `app/`, e.g. a root-level `components/` dir), applies
  `<CmsGroup>` prefixes,
  collects `scope="global"` regions under the global slug, and builds one
  manifest per page slug. Files that fail to parse are skipped with a warning;
  an alias that resolves to nothing warns too instead of silently dropping the
  file.
- **Sync** pushes each manifest to the backend (idempotent). New regions get a
  row seeded from `defaultValue`; removed regions are pruned. When discovery
  finds nothing, `cms-sync` refuses to push (an empty manifest would
  soft-delete every remote slug) unless you pass `--allow-empty`.

Because discovery reads the JSX statically, `blockType` and `defaultValue` must
be **plain literals**, the scanner can't evaluate variables or imports.

You can also register a read-only block that has no `<EditableRegion>` on the
page by passing discovery metadata to `useCmsBlock(path, { blockType, defaultValue })`.

### Slugs

A **slug** is the page identity blocks are addressed by. It is derived from the
page file's own path, so it is never written down twice:

| Page file | Slug |
| --------- | ---- |
| `app/page.jsx` | `/` |
| `app/about/page.jsx` | `/about` |
| `app/(marketing)/pricing/page.jsx` | `/pricing` |
| `app/news/[id]/page.jsx` | `/news/[id]` |
| `app/[locale]/about/page.jsx` | `/about` (with `locales` configured) |

The rules behind that table:

- **Route groups** (`(marketing)`) organise files without appearing in the URL,
  so they drop out of the slug too.
- **Dynamic segments** (`[id]`) stay as written: the manifest addresses the
  route template, not one concrete URL, so `/news/1` and `/news/2` share a page.
  That means they also **share one set of rows**; see
  [Per-URL content](#per-url-content) before declaring regions on such a page.
- **The leading segment is the locale** when `cms.config.js` exports `locales`,
  and it drops out: which language a page is in is not part of which page it is.
  Without `locales` it is kept like any other segment. inscribed only ever reads a
  language from the **first** path segment (see [Localization](#localization)),
  which is what makes this unambiguous.
- **Private folders** (`_lib`), **parallel-route slots** (`@modal`) and
  **intercepting routes** (`(.)photo`) are not pages of their own, so they are
  skipped entirely and the regions inside them reach no manifest.
- **A page that declares no regions owns no rows**, so its slug never reaches
  the backend. A collection detail view or a form page costs nothing.

Dynamic routes are the one place the slug is also written by hand: the
`x-pathname` header carries the concrete path (`/news/1`), not the template, so
`<CmsPage>` needs it explicitly and it has to match the folder names.

```jsx
// app/news/[id]/page.jsx
<CmsPage slug="/news/[id]">
```

> **Check the derivation** with `cms-sync --dry-run`. It prints each slug beside
> the page file it came from, which is where a surprise shows up.

#### Per-URL content

A dynamic-segment slug is **one** manifest entry, so every concrete URL under it
reads and writes the same rows. For `/search/[q]`, whose copy is the same
whatever was searched for, that is exactly right. For `/kampanya/[slug]`, where
each campaign has its own words, it is a trap: editing `/kampanya/yaz-2026` also
rewrites `/kampanya/kara-cuma`. Nothing in the page says which one you meant, so
`cms-sync` warns whenever a dynamic-segment page declares regions and leaves the
choice to you.

When each URL needs its own content, two patterns cover it:

**Records the editor creates** belong in a [collection](#collections). The route
renders one record and declares no regions of its own, so it never enters the
manifest:

```jsx
// app/news/[slug]/page.jsx
<CollectionItem collection="news" slug={slug} missing={<NotFound />}>
  <CollectionField name="title" as="h1" />
  <CollectionField name="body" />
</CollectionItem>
```

**A fixed set of pages the developer owns** gets a folder each, with the markup
shared through a component. Every folder derives its own slug and therefore its
own rows, while the shape stays written once:

```jsx
// app/kampanya/_body.jsx  (a leading _ keeps Next from routing it)
export function CampaignBody() {
  return (
    <CmsGroup name="hero">
      <EditableRegion blockPath="title" blockType="ShortText" defaultValue="Campaign" as="h1" />
      <EditableRegion blockPath="body" blockType="RichText" defaultValue="<p>Edit me.</p>" />
    </CmsGroup>
  );
}

// app/kampanya/yaz-2026/page.jsx   -> /kampanya/yaz-2026, its own rows
// app/kampanya/kara-cuma/page.jsx  -> /kampanya/kara-cuma, its own rows
import { CampaignBody } from "../_body.jsx";

export default function Page() {
  return <main><CampaignBody /></main>;
}
```

This is the "shared component reachable from two slugs contributes its regions
to both" rule doing its job: one declaration, one set of rows per page.

### Blocks & block types

A **block** is a single editable value addressed by a dot-notation `blockPath`
(e.g. `hero.title`). The value shape depends on its `blockType`:

| `blockType`  | Value shape | Editor |
| ------------ | ----------- | ------ |
| `ShortText`  | `string` | single-line input |
| `LongText`   | `string` | multi-line textarea |
| `RichText`   | HTML `string` (sanitised) | Tiptap |
| `Image`      | `{ src, alt }` | on-image replace / drop-zone + alt |
| `Link`       | `{ href, label }` | URL + label |
| `Date`       | ISO 8601 `string` | date picker / countdown |
| `List`       | array of objects shaped by `itemSchema` | repeatable items |
| `Collection` | `{ collection, slug? }` binding (read-only) | n/a (see [Collections](#collections)) |

`LongText` **keeps its line breaks**. The region renders with
`white-space: pre-wrap`, and Enter in the in-place editor inserts a real newline
into the value; left to the browser it would insert a `<br>`, which the block
never sees. Set `white-space` in your own `style` and yours wins.

> `Text` was a legacy alias of `LongText` and is gone in 4.x. Blocks that still
> arrive typed `Text` are folded to `LongText` as they enter the runtime, so
> older rows and custom transports keep working.

For full control over rendering, read a block directly from a Client Component
with `useCmsBlock(blockPath)`, it returns the raw `value`, `version`, and an
`update()` callback.

### Groups

`<CmsGroup name="hero">` prefixes the `blockPath` of every descendant region.
A `<EditableRegion blockPath="title">` inside it reads/writes `hero.title`.
Groups nest (dot-joined), and discovery applies the exact same prefix so you
never repeat the group name in each path. In admin mode the group also draws a
labelled outline so editors can see section boundaries.

The prefix follows the **render site**, not the file. Wrapping an imported
component in a group prefixes the regions it declares too, so the group name is
written once, where the component is used:

```jsx
// page.jsx           -> the list below syncs as hero.highlights
<CmsGroup name="hero">
  <HeroHighlights />
</CmsGroup>

// hero-highlights.jsx -> no group, no repeated prefix
<EditableList blockPath="highlights" … />
```

A component rendered under two different groups contributes its regions once
per prefix.

> **One limit:** discovery follows static JSX, so
> `<CmsGroup name="hero">{children}</CmsGroup>` is opaque to it. The prefix
> still applies at runtime, but the manifest registers those regions
> unprefixed and they never resolve; `cms-sync` warns when it sees this.
> Render the components inside the group instead of taking them as children.

A `<CollectionItem>` inside a group is filed under it too, but by a different
route: its binding carries the group name rather than baking it into a path (see
[Collections](#collections)). Nothing of it reaches the manifest, so the
`{children}` limit above doesn't apply to collection bindings.

`<CmsGroup>` also accepts `visible` / `editable` to lock or hide a whole section
in one place; the mode cascades to every descendant. See
[Access control](#access-control).

### Lists

`<EditableList>` renders a `List`-typed block as repeatable items via a
render-prop. You provide an `itemSchema` describing each item's fields each
field's `blockType` is one of the leaf types above (`ShortText`, `LongText`,
`RichText`, `Image`, `Link`, `Date`). Admins get add / remove / reorder controls
and the whole list saves atomically as one version. It accepts the same `visible` / `editable` gates as `<EditableRegion>`
(see [Access control](#access-control)) read-only drops the add/move/delete
affordances and locks the drawer card.

```jsx
"use client";
import { EditableList } from "inscribed";

export function Team() {
  return (
    <EditableList
      blockPath="team.members"
      itemSchema={{
        name:  { blockType: "ShortText", defaultValue: "" },
        photo: { blockType: "Image",     defaultValue: { src: "", alt: "" } },
      }}
    >
      {(item, i) => (
        <article key={i}>
          <img src={item.photo.src} alt={item.photo.alt} />
          <h3>{item.name}</h3>
        </article>
      )}
    </EditableList>
  );
}
```

By default the list renders no element of its own, so items land directly in
whatever container you wrap it in. Pass `as` (with the layout props that
container had) to fold the wrapper into the list and get the page-side ring and
label chip on the block as a whole:

```jsx
<EditableList
  blockPath="team.members"
  as="div"
  style={{ display: "grid", gap: 12 }}
  itemSchema={{ … }}
>
```

The `as` wrapper renders in public mode too, so the layout is identical for
visitors and admins, only the ring and chip are admin-only.

Admins get an add slot after the last item, drawn as a ghost of a real card so
the grid keeps its shape. Pass `noInlineAdd` for layouts a ghost card would
spoil (a slider, a fixed-size grid); items are then added from the drawer and
the rest of the page-side editing is unchanged.

```jsx
<EditableList blockPath="hero.slides" as="div" noInlineAdd itemSchema={{ … }}>
```

> `<EditableList>` uses a render-prop, a function child, so it must live in a
> `"use client"` component. Wrap the usage and import that wrapper into your
> server page. The Collection components below take element children instead,
> precisely so they don't need this.

### Collections

Collections are a separate namespace for structured data that lives outside the
page (e.g. all News articles, all Teams). The page **binds** to a collection and
renders its records.

The collection layer is an **opt-in capability** with its own entry point: import
it from `inscribed/collections`, not `inscribed`, so apps that don't use
collections never pull it into their bundle.

- `<CollectionRegion collection="news" filter={...} limit={...}>` renders a list.
- `<CollectionItem collection="news" slug="q1-notes">` renders one record.

Neither takes a `blockPath`. A binding is identified by what it points at, the
record for an item and the (collection, filter) window for a region, so the same
article rendered in two places on a page is one drawer card, not two. Inside a
`<CmsGroup>` an item's card is filed under that group; `group` and `label`
override the placement and the card text without changing which record is bound.

#### Fetching on the server

Both components come in two forms with the **same children contract**. Which one
you import decides where the data is fetched:

| Import from | Fetches | Use when |
| ----------- | ------- | -------- |
| your `createCmsPage` factory | server, streamed | the default: content reaches the HTML a crawler sees |
| `inscribed/collections` | client, on mount | you are already inside a `"use client"` component |

Opt in with the `collections` option; the factory then returns the components
beside `CmsPage`:

```jsx
// app/lib/cms.jsx
import { CmsProvider } from "inscribed";
import { CollectionRecord, CollectionRows } from "inscribed/collections";
import { createCmsConfig, createCmsPage } from "inscribed/page";
import { revalidateCmsCollection, revalidateCmsSlug } from "inscribed/actions";

export const { CmsPage, CollectionRegion, CollectionItem } = createCmsPage({
  config: createCmsConfig({ baseUrl: process.env.CMS_URL }),
  Provider: CmsProvider,
  collections: { CollectionRecord, CollectionRows },
  onAfterSave: revalidateCmsSlug,
  onAfterCollectionSave: revalidateCmsCollection,
});
```

`CollectionRecord` and `CollectionRows` are internals; they appear in your wiring
for the same reason `Provider` does. Only a module's own **exports** become client
references across the Server → Client boundary, so the client half of these
components has to be handed in by name: reached from the server entry's own
imports it would lose its `"use client"` boundary, and wrapped in an object it
would arrive `undefined`.

Each server component is a synchronous shell wrapping its own `<Suspense>` around
an async fetch. That is what keeps a slow collection off the critical path: the
page shell flushes immediately and the records stream in behind it, still landing
in the document. You write no boundary of your own, which matters because a
collection may be reading external data whose latency you don't control.

```jsx
// app/page.jsx  (a Server Component)
import { CollectionField } from "inscribed/collections";
import { CollectionRegion } from "./lib/cms.jsx";

export default function Home() {
  return (
    <CollectionRegion
      collection="news"
      limit={5}
      as="ul"
      fallback={<NewsSkeleton />}
      empty={<p>No news yet.</p>}
    >
      <li>
        <CollectionField name="title" as="h3" />
        <CollectionField name="summary" as="p" />
      </li>
    </CollectionRegion>
  );
}
```

Children are **elements, not a function**, which is what lets them cross the
Server → Client boundary. A region renders its children once per record, each
under that record's own scope, so `<CollectionField>` resolves against the row it
sits in. `as` folds a wrapper element (here `<ul>`) into the region and takes any
extra props.

Every state other than "records resolved" is a prop:

| Prop | Shown when |
| ---- | ---------- |
| `fallback` | the read is in flight (client form only; the server form has awaited it) |
| `empty` | a region resolves to zero records |
| `missing` | an item's record does not exist (404) |
| `error` | the read failed for any other reason; defaults to `missing` |

Server-fetched records are cached under `cms-collection-{key}` (plus
`cms-collection-{key}-{slug}` for a single record), so publishing one must drop
those tags: that is what `onAfterCollectionSave` is for. Omit it and the page
keeps serving the pre-publish row.

#### Computing with a record

`<CollectionField>` renders a field. When markup needs to *compute* with one, an
href built from the slug, a conditional, a formatted date, reach for
`useCollectionRecord()` in a small client component nested inside the record:

```jsx
// app/news-card-link.jsx
"use client";
import Link from "next/link";
import { useCollectionRecord } from "inscribed/collections";

export function NewsCardLink({ children }) {
  const { slug } = useCollectionRecord();
  return <Link href={`/news/${slug}`}>{children}</Link>;
}
```

`data` on that record is draft-overlaid, so an editor sees what they are typing
and a visitor sees what is published.

> **Interactive windows stay on the client.** A filter or pagination driven by
> user input can't be resolved on the server, so build those with `useCollection`
> / `useCollectionItem` in your own component. Those hooks remain the full
> client-side API, and `refetch` (which needs a callback, and so no longer
> crosses the children boundary) lives there too.

#### Editing a field in place

`<CollectionField>` renders one field of the enclosing item and, for an admin
who may edit the record, turns it into the same in-place editor
`<EditableRegion>` uses. The item's ring then carries publish and revert, so a
quick fix never has to travel to the drawer:

```jsx
<CollectionItem collection="news" slug={slug} missing={<NotFound />}>
  <article>
    <CollectionField name="title" as="h1" style={titleStyle} />
    <CollectionField name="summary" as="p" style={summaryStyle} />
  </article>
</CollectionItem>
```

An `Image` field gets the same treatment as an image region: hover the picture
for replace/remove, or drop one onto the empty field. Alt text stays in the
drawer, where a text input belongs.

A `RichText` field needs one word from you, because the field's type comes from
`/me` and visitors never see it: without the flag they would read the markup as
text while you edited it as prose.

```jsx
<CollectionField name="body" as="div" html />
```

It renders the toolbar editor for an editor and sanitised HTML for everyone
else. `cms-sync` can't catch a missing `html`, so the component warns in dev.

The element is the same for visitors and admins, so the page doesn't shift when
you sign in. **`ShortText`, `LongText`, `RichText` and `Image` edit in place**;
every other type renders read-only and keeps its drawer editor, which remains
the complete surface for the record. A date picker or a repeatable sub-form has
no sensible affordance mid-paragraph, and unlike text, markup and `{ src, alt }`
they aren't recognisable without the schema.

Page fields and the drawer card edit **one** draft and stay in step both ways:
type on the page and the open card follows along, type in the card and the page
does. Only one surface runs the autosave, so a keystroke is one request no
matter how many places show it, and a card nobody can see (collapsed, or behind
a shut panel) stops mirroring until it's back in view.

Editing a collection item is schema-driven: the backend's `/schema` describes
each field's `type`, and the exported `<CollectionFieldsForm>` renders one input
per type:

| `type` | Value shape | Editor |
| ------ | ----------- | ------ |
| `ShortText` / `LongText` | `string` | input / textarea |
| `RichText` | HTML `string` | Tiptap |
| `Number` | `number \| null` | number input |
| `Bool` | `boolean` | switch |
| `Url` | `string` | URL input |
| `Date` | ISO 8601 `string` | date-time input |
| `Image` | `{ src, alt }` | upload dropzone + alt |
| `StringArray` | `string[]` | tag input |
| `ObjectArray` | array of objects shaped by `itemFields` | repeatable sub-form |

An `Image`
field uploads through the transport's `uploadImage` and stores the returned CDN
URL as `src`; `alt` is required once `src` is set (the backend rejects a
half-filled image). The form is styled neutrally (it inherits the host page's
font and colours), so it reads on both the dark drawer and a light page.

**Creating items from your own page.** For collections that support creation (an
`AutoGenerated` slug plus create permission), mount `<CollectionComposer>` on any
route to render a bare "add one item" form. It carries no CMS chrome, it inherits
the page's styling, so the screen reads like a normal "new article" page rather
than an admin panel:

```jsx
// app/news/new/page.jsx
"use client";
import { CollectionComposer } from "inscribed/collections";
import { useRouter } from "next/navigation";

export default function NewNews() {
  const router = useRouter();
  return (
    <CollectionComposer
      collection="News"
      submitLabel="Publish"                          // default: "Oluştur"
      onCreated={(item) => router.push(`/news/${item.slug}`)}
    />
  );
}
```

`onCreated` receives the created item (with its backend-assigned `slug`); omit it
and the form resets with an inline confirmation instead. A single reusable hook,
`useCollectionCreate`, backs both this form and the drawer's "new item" card.

> The composer renders **nothing** for visitors without create access, and warns
> in dev when the `collection` key isn't among the session's accessible
> collections (`GET /cms/collections/me`). A misspelled key or a missing
> membership shows a blank, not an error, so check the dev console first.

### Editing & drafts

Editing turns on when the provider knows the visitor is an admin and how to get
their access token. There are two ways to get there.

**Zero-config, against the reference backend:** set `clientKey` in the config
and register the site's origin as a Client on the backend. Editors sign in by
opening any page with `?cms-login`; the provider runs the backend's
cookie + refresh flow client-side (single-flight and multi-tab safe, so the
backend's refresh-token reuse detection never trips), checks the token's
capabilities, and mounts the drawer for users holding `content:write` on this
`clientKey`. A `?cms-logout` link signs them back out (as does the drawer
footer's button). Anonymous visitors trigger zero auth traffic and read
published content through the public endpoint (needs the client's
`allowAnonymousContentRead` flag); protected setups pass a `render`-preset
service key via `getServiceToken` instead.
Note the session cookie is scoped to the API origin, so the drawer mounts a
beat after hydration - the server always renders the public view.

**Bring your own auth** in two pieces:

1. **Server side:** give `createCmsPage` an auth adapter so it can resolve the
   session and decide `isAdmin`:

   ```jsx
   export const { CmsPage } = createCmsPage({
     config: cmsConfig,
     Provider: AdminCmsProvider,            // your wrapper, see below
     getServiceToken,                        // server-only read token (optional)
     getSession: () => auth(),               // your session resolver
     deriveAdmin: (session) => Boolean(session?.user?.isAdmin),
     onAfterSave: revalidateCmsSlug,         // from "inscribed/actions"
     // Only if your wrapper needs a session on the client (see the note below):
     // sessionForClient: (session) => ({ user: session.user }),
   });
   ```

   > **The session stays on the server unless you opt in.** `Provider` is a
   > Client Component, so every prop it receives is serialized into the page
   > payload and shipped to the browser. Sessions routinely carry an access
   > token, a refresh token or internal claims, none of which inscribed reads.
   > If your wrapper feeds a session provider (NextAuth's `<SessionProvider>`,
   > say), add `sessionForClient` and return only the fields that may travel.

2. **Client side:** `CmsProvider` needs `getAccessToken` to attach a Bearer
   token to write requests. Since that's a client concern, wrap `CmsProvider` in
   a thin `"use client"` component that supplies it from your session:

   ```jsx
   "use client";
   import { CmsProvider } from "inscribed";
   import { useSession } from "your-auth-lib/react";

   export function AdminCmsProvider(props) {
     const { getToken } = useSession();
     return <CmsProvider {...props} getAccessToken={getToken} />;
   }
   ```

Once enabled, admins edit the same page in place. **Text** and **RichText**
blocks edit where they sit, click and type, with a small floating toolbar for
RichText formatting; **Image** blocks edit on the image (a replace / remove
overlay, or an upload drop-zone when empty). **Link**, **Date**, **List**, and
**Collection** blocks open the side drawer instead. Every block also shows a
hover **label chip** that opens its drawer card for structured details (an
image's alt text and URL, a link's label) whatever its type. Focusing a block to
edit it highlights the region without opening the drawer; only the chip does.

Edits **autosave as drafts** (debounced ~1s to the draft endpoint) while a live
preview overlays the page; **publishing** is an explicit save in the drawer.
Discarding clears the server draft. inscribed itself depends on **no auth
library**; these are all injected callbacks, with a public read-only default.

**A refused publish is resolved per block.** The backend rejects a write whose
version is behind, which is what happens when someone else published the same
block while you were editing it. The drawer reloads the page, marks the cards it
clashed on, and shows both candidates on each: the value the server now holds
against the one you typed. **Take theirs** drops your edit for that block,
**keep mine** leaves it pending so the next save writes it at the version just
fetched. Your text stays in the draft either way, so nothing goes without you
choosing it. A conflict carrying no block-level detail (two writes racing on one
row) only asks for a retry, since there is nothing to compare.

### Localization

Three steps, no new files. Declare the languages once somewhere the middleware
can also read — `cms.config.js`, which the `cms-sync` CLI already looks for:

```js
// cms.config.js
export const locales = ["tr", "en"];
```

**Order is meaningful: the first entry is the default locale** — the one that sits
at the root with no prefix. There is no separate `defaultLocale` option, because
the backend derives its own default the same way and two inputs are two things
that can disagree. List the language your existing content is written in first.

Hand that to both the config and the middleware:

```js
// app/lib/cms.jsx
import { locales } from "../../cms.config.js";

export const cmsConfig = createCmsConfig({ baseUrl: process.env.CMS_URL, locales });
```

```js
// middleware.js
import { createCmsMiddleware } from "inscribed/middleware";
import * as cms from "./cms.config.js";

export const middleware = createCmsMiddleware(cms);
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
```

Then move your routes under `app/[locale]/` — but keep `<CmsPage>` in the root
layout, **above** that segment:

```jsx
// app/layout.jsx        ← above [locale], not inside it
import { CmsPage, getCmsRoute } from "./lib/cms.jsx";

export default async function RootLayout({ children }) {
  const { locale } = await getCmsRoute();
  return (
    <html lang={locale}>
      <body><CmsPage>{children}</CmsPage></body>
    </html>
  );
}
```

That placement is load-bearing. A layout instance belongs to its segment's
value, so a `<CmsPage>` inside `app/[locale]/` is torn down and rebuilt every
time the language changes. The editor's session is client state inside
`CmsProvider` — admin-ness resolves after hydration, since the refresh cookie
lives on the API origin — so the remount signs them out mid-session and the
drawer disappears. The block cache goes with it, and every switch re-fetches.

Above the segment the provider survives the switch: the session holds, and the
page you came from renders from cache when you go back.

`getCmsRoute()` comes back from `createCmsPage` and resolves the language from
the same header `<CmsPage>` reads, which the root layout needs because it sits
above `[locale]` and has no `params.locale` of its own.

The default language stays at the root and the others sit behind their prefix:
`/about` is Turkish, `/en/about` is English. The middleware rewrites the
unprefixed path onto `app/[locale]/` so `tr` never reaches the address bar, and
sets the `x-pathname` header `<CmsPage>` reads.

A leading segment counts as a locale only when `locales` lists it, so a page at
`/en-masse` is not mistaken for English. (Reading also handles a prefix on
*every* language, if you would rather write your own middleware for that; the
bundled one and `localePath` commit to default-at-root.)

Reach the active language from a component — no locale prop threading, no second
copy of the list:

```jsx
"use client";
import { useCmsRoute } from "inscribed";

const { locale, slug, localePath } = useCmsRoute();
<a href={localePath("/about")}>…</a>          // stays in the current language
<a href={localePath(slug, "en")}>English</a>  // a language switcher
```

Server Components can't call hooks, so `createCmsPage` hands back the same
helper already bound to your config:

```jsx
export const { CmsPage, localePath } = createCmsPage({ /* … */ });

<Link href={localePath("/about", locale)}>…</Link>
```

**Your manifest does not change.** The slug is what a page is; the locale is which
language of it you are looking at. So a localized app still syncs one entry per
page: `app/[locale]/about/page.jsx` becomes `/about`, because a leading segment
is a language once `locales` is set (see [Slugs](#slugs)).

`cms-sync` sends that one entry, plus the language list itself as
`?locales=tr,en`. That is what keeps `cms.config.js` the single home for it: the
backend learns which languages exist from the code rather than from a second
copy someone has to remember to update. It then materializes a row per locale,
each seeded with the block's `defaultValue`.

**Adding a language is one step: put it in `locales`, re-run `cms-sync`.**
Removing one is the same step — its rows fall out of the desired state and are
soft-deleted like any other removed block, and restored if you add it back.

Nothing falls back — an
untranslated block renders its default value, so a missing translation is visible
rather than quietly wearing another language's text.

Everything downstream follows the route on its own:

| Surface | Behaviour |
| ------- | --------- |
| Blocks | Read and written in the route's locale; `__global` too, so the header matches the page |
| Drafts | One slot per language, on their own autosave lanes |
| Cache tags | `cms-{locale}-{slug}`, so publishing one language leaves the others cached |
| `useCollection` | Lists the route's locale unless you pass `locale` yourself |
| New records | Composed in the route's locale, with a per-language draft slot |
| The drawer | Offers the other languages when a text block is rewritten, and publishes them together |

#### Keeping the languages in step

Nothing falls back, which is honest but leaves a gap: rewrite a paragraph in
Turkish and the English copy still says the old thing, correctly and invisibly.

So the drawer asks. Rewrite more than a few words of a text block and the other
languages appear under it, each prefilled with what it currently says:

```
hero.body   [ Şirketimiz 1998'den beri… ]
            ┌───────────────────────────────────────┐
            │ 🌐 Bu metin diğer dillerde değişmedi  │
            │ EN  /en   [ Our company has served… ] │
            └───────────────────────────────────────┘
```

Type into it and it publishes with the block it sits under — one `PUT` per
language, each versioned against its own row, each revalidating its own tag. So
"publish" means the same thing it always did: everything you have pending.

The prompt is deliberately quiet. It only appears for `ShortText`, `LongText`
and `RichText` (translating a date or an image URL is not a thing), only once
the diff crosses a few words, and only after typing settles — a typo fix or a
bolded word never triggers it. `RichText` is compared on its text, so
reformatting is not a rewrite. Past three other languages the editors would
dwarf the block they hang off, so it degrades to a dismissible line naming them.

This is not machine translation: the field is prefilled with the current copy
and you write the rest. Staged translations are never autosaved as drafts —
they live from the moment the prompt opens until you publish, and navigating
away drops them.

#### Translating a collection record

Collection records are one row per language, and their slugs stay unique across
the whole collection. So a record and its translation carry different slugs
(`yeni-urun`, `new-product`) — which is what you want for search engines anyway,
and why every per-slug endpoint identifies a record without being told a locale.

What links them is a **translation group**. Every record gets one when it is
created, so a record with no translations is simply the only member of its own
group; nothing has to be created later to link them. Reading a single record
tells you the rest of its group:

```jsonc
GET /cms/collections/news/new-product
{
  "slug": "new-product", "locale": "en",
  "translationGroupId": "8f3f…",
  "translations": [{ "locale": "tr", "slug": "yeni-urun" }]
}
```

To write a translation, pass that group id back:

```jsx
const { translationGroupId } = useCollectionRecord();

<CollectionComposer collection="news" translationOf={translationGroupId} locale="en" />
```

`locale` is explicit here on purpose. Everywhere else the language comes from the
route, but a translation is the one flow where it can't: the editor is reading
the Turkish page while writing the English copy.

The admin drawer does this for you. A record's detail pane shows one chip per
language the collection declares — the current one, the ones that exist (click to
open), and the ones missing (click to compose). Which is also why the chips
matter: without them an editor can write a whole record before the backend
rejects it as a duplicate, and the rejection can't say where the existing one is.

None of this decides what language the *panel itself* speaks. That is
[`adminLocale`](#panel-language), and it is a separate setting on purpose:
these locales are your content's, and are arbitrary, while the panel speaks
whatever someone has written a catalog for.

Omit `locales` and none of this engages: no `locale` reaches the wire, tags keep
their pre-i18n shape, and the backend answers with the Client's default language.

### Theming

The admin panel and the page-side editing affordances are styled through a set
of CSS custom properties (`--ins-*`) with the stock warm-neutral palette baked
in as fallbacks. Pass a `theme` to `createCmsConfig` to override a small,
stable subset; `CmsProvider` emits it once as a `:root` block, and every
derived tint (soft fills, borders, the text ramp) is computed from these bases
with `color-mix`, so changing one base cascades everywhere it's used.

Every key is optional and falls back to the stock value below, so pass only the
ones you want to change. These are the actual defaults:

```js
export const cmsConfig = createCmsConfig({
  baseUrl: process.env.CMS_URL,
  theme: {
    accent: "#c9b896",                  // sand: dirty rails, focus, primary buttons
    collectionAccent: "rgb(220,195,225)", // pink-purple: Collection surfaces
    danger: "rgb(232,132,152)",         // rose: destructive / error accent
    bg: "#1c1815",                      // warm-dark panel base (raised/sunken shades derive from it)
    surface: "#ffffff",                 // elevation-overlay base (surface/border alphas mix from it)
    text: "#ffffff",                    // foreground base (the text ramp mixes from it)
    radius: 10,                         // card/panel corner radius (number = px)
    fontSans: '"Inter Tight", "Inter", system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
  },
});
```

For example, to recolor just the brand accent, pass `theme: { accent: "#3b82f6" }`
and leave the rest untouched. Unknown keys are dropped; overriding nothing is
identical to shipping the stock theme. (Theming relies on CSS `color-mix`,
supported by all current evergreen browsers.)

### Panel language

The panel's own wording ("Save", "Collections", "Undo") is English by default
and set in one place:

```js
createCmsConfig({
  baseUrl: process.env.CMS_URL,
  adminLocale: "tr",   // built-in: "en" (default) and "tr"
});
```

**This is not [`locales`](#localization), and the two are deliberately
unrelated.** `locales` is what the *site's content* comes in: arbitrary, as many
as you sell in. `adminLocale` is what the *editing surface* speaks, and only what
someone has written a catalog for. An editor working through the English copy of
a page has no reason to have their toolbar change under them, so the panel does
not follow the route.

#### Rewording, and adding a language

Strings are keyed flat, so overriding some of them is just supplying those keys:

```js
createCmsConfig({
  adminLocale: "tr",
  adminStrings: { "status.save": "Yayınla" },
});
```

A language with no built-in catalog is a first-class case, not an error. Give
`adminLocale` the tag and `adminStrings` the wording:

```js
import de from "./cms-strings.de.js";

createCmsConfig({ adminLocale: "de", adminStrings: de });
```

Plural selection then follows German, and anything you left out still reads in
English rather than showing a raw key. That per-key fallback is why a partial
catalog is safe to ship and fill in later.

Counted strings carry `_one` / `_other` variants, picked through
`Intl.PluralRules`:

```js
{
  "status.unsaved_one": "{count} unsaved change",
  "status.unsaved_other": "{count} unsaved changes",
}
```

A language that takes one form after a number writes only `_other`, and a
catalog owns every form of a key it mentions: supplying `_other` alone means
English's `_one` does **not** show through underneath it.

The key list is `src/shared/i18n/en/`, split by area (`panel`, `collections`,
`editors`, `core`). Unknown keys render as the key itself and warn once in
development, so a typo is visible rather than blank.

Only the tag and your overrides reach the browser as data; the built-in
catalogs are code. A site that sets nothing ships no configuration for this at
all.

### Access control

By default every `<EditableRegion>` / `<EditableList>` is editable by anyone whose
session satisfies `isAdmin`. Two props let you narrow that per block, without
touching the provider or the auth layer. They gate **both** the inline page
overlay and the block's card in the admin drawer:

| Prop | Type | Default | Behaviour |
| ---- | ---- | ------- | --------- |
| `readOnly` | `boolean` | `false` | The block is **read-only**: no inline overlay on the page, and its drawer card stays visible but locked (every field disabled, with a lock badge). |
| `hidden` | `boolean` | `false` | The block is **removed from the admin drawer entirely** (no card, no count) and renders read-only on the page. Takes precedence over `readOnly`. |

These are **runtime-only** gates discovery still syncs the block and seeds its
row, so the content renders normally for every visitor; only the *editing*
surface is affected. `hidden` is the stronger of the two: a block the admin
panel can't see is never editable either.

Both are plain booleans, so a fixed gate is JSX shorthand: `<EditableRegion hidden>`.
The inverted spelling, `editable={false}` and `visible={false}`, still works and
still means the same thing; where both appear on one component the more
restrictive wins.

The props carry no role logic themselves. Compute the boolean however your app
resolves roles and pass it in. This is the case the older spelling reads better
in, which is why it stayed:

```jsx
// Derive canEdit from your auth context / session
const canEdit = userRoles.includes("CONTENT_EDITOR");

<EditableRegion
  blockPath="hero.title"
  blockType="ShortText"
  defaultValue="Welcome"
  as="h1"
  editable={canEdit}
/>
```

**Section-level gating.** Set the same props on a `<CmsGroup>` to gate every
descendant region and list at once. The mode cascades down (nested groups
included); precedence is **most restrictive wins** (`hidden` > `readonly` >
normal), so a child can *tighten* the section's mode but not loosen it:

```jsx
<CmsGroup name="hero" readOnly>
  {/* whole section read-only in the drawer */}
  <EditableRegion blockPath="title" blockType="ShortText" defaultValue="Welcome" as="h1" />
  {/* a child can go further and hide itself, but can't re-enable editing */}
  <EditableRegion blockPath="badge" blockType="ShortText" defaultValue="New" hidden />
</CmsGroup>
```

The cascade covers **collection records** too. A `<CollectionItem>` inside a
locked group renders read-only on the page and its drawer card is locked; inside
a hidden one it leaves the drawer entirely. Fields the record's own `canEdit`
already denies stay read-only regardless: the group can tighten access, never
widen it.

### Caching & revalidation

Server reads are ISR-cacheable and tagged, so each publish drops exactly what it
invalidates:

| Read | Tag | Dropped by |
| ---- | --- | ---------- |
| `getCmsPageBlocks` | `cms-{slug}`, or `cms-{locale}-{slug}` | `revalidateCmsSlug` as `onAfterSave` |
| `getCmsCollection` | `cms-collection-{key}` | `revalidateCmsCollection` as `onAfterCollectionSave` |
| `getCmsCollectionItem` | `cms-collection-{key}-{slug}` (plus the collection's) | the same, which drops both |

Pass those two Server Actions and stale visitor content is gone on the next
request; omit one and the page keeps serving the pre-publish version. Publishing a
record always drops the **whole** collection, not just the record: a write can
move rows between filter windows, reorder a list or change its total, so every
window that mentions the collection is suspect.

The global slug (header/footer/site-wide blocks) is fetched in parallel and merged
into the same blocks map, so a shared block edited on any page reflects everywhere.
Tags you pass yourself stay off that shared entry: `__global` backs every page, so
one page's revalidation must not rebuild everyone's header and footer.

On a [multilingual site](#localization), each language of a page is its own tag, so
publishing the English copy leaves the Turkish render alone. Collections are the
exception, and deliberately: a locale is one more dimension of a list window, and a
write can move rows between windows exactly as a filter change does, so every
window shares the one collection tag.

**Drafts never survive a server read.** `getCmsContent`, `getCmsPageBlocks`,
`getCmsCollection` and `getCmsCollectionItem` drop `draftValue` and `draftData`
before returning. These responses are ISR-cached under one tag for **every**
visitor, so a draft that survived would be served to the public. An editor's
unpublished work reaches the page through the client store instead, fetched with
their own token.

> **Building a preview route?** Pass `includeDrafts: true` to keep drafts in the
> response, and cache that route separately (or not at all). The flag is explicit
> because intent cannot be read off the credential: a deliberate preview and a
> service key that is merely over-scoped look exactly the same from here.

On the client, blocks are cached per route for the life of the session. Returning
to a page you have already visited renders from that cache on the first render and
revalidates behind it, so a soft navigation shows no gap.

---

## Architecture: the seams

inscribed's core knows nothing about your backend or auth provider. Three injection
seams keep it vendor-neutral; each has a default in `src/defaults/` so the
zero-config path still works.

| Seam | Contract | Default | What it abstracts |
| ---- | -------- | ------- | ----------------- |
| **Transport** | `CmsTransport` | REST adapter (`/cms/*`) | _how_ to talk to the backend |
| **Service token** | `getServiceToken()` | none (unauthenticated reads) | server-side read credentials |
| **Auth adapter** | `getSession` / `deriveAdmin` / `deriveUserSub` | public, read-only | who the visitor is (server) |
| **Browser auth** | `getAccessToken()` prop | reference `/auth/*` flow when `clientKey` is set, else off | who the editor is (client) |

A guiding constraint: **functions can't cross the React Server → Client
boundary.** That's why `createCmsConfig` returns only serializable data and the
transport is resolved at the *use site* on each side (the client provider builds
it; server helpers default it). Inject a custom transport separately on the
server (at the call site) and client (the `transport` prop); a single transport
object can't be shared across the boundary.

The token/auth seam is orthogonal to transport: the transport attaches whatever
`accessToken` it is handed to the request header; it never mints tokens itself.

## Bring your own backend

To target a backend other than the reference REST API, implement the
`CmsTransport` contract. The core only ever calls these methods:

```js
/**
 * @typedef {Object} CmsTransport
 * @property {(slug, opts?) => Promise<ContentResponse>}                              getContent
 * @property {(key, params?, opts?) => Promise<PagedListResponse>}                    getCollection
 * @property {(key, slug, opts?) => Promise<CollectionItemResponse>}                  getCollectionItem
 * @property {(opts?) => Promise<MyCollectionResponse[]>}                             getMyCollections
 * @property {(request, opts?) => Promise<UpdatePageResponse>}                        updateContent
 * @property {(request, opts?) => Promise<void>}                                      updateDraft
 * @property {(slug, opts?) => Promise<void>}                                         deleteDraft
 * @property {(key, slug, payload, opts?) => Promise<CollectionItemResponse>}         upsertCollectionItem
 * @property {(key, payload, opts?) => Promise<CollectionItemResponse>}               createCollectionItem
 * @property {(key, slug, payload, opts?) => Promise<void>}                           saveCollectionItemDraft
 * @property {(key, slug, opts?) => Promise<void>}                                    deleteCollectionItemDraft
 * @property {(key, payload, opts?) => Promise<void>}                                 saveCollectionNewDraft
 * @property {(key, opts?) => Promise<void>}                                          deleteCollectionNewDraft
 * @property {(file, opts?) => Promise<{ data: { url: string } }>}                    uploadImage
 * @property {(manifests, opts?) => Promise<SyncResultResponse>}                      syncManifests
 */
```

Every method receives an options object:
`{ accessToken?, cache?, signal?, locale? }`. Attach `accessToken` to your request
as a Bearer (or however your backend expects); **don't** generate it. `cache` is an
opaque hint (`{ revalidate, tags }`); the REST default maps it onto Next.js'
`fetch(..., { next })` extension. `locale` says which language the call addresses
and is absent unless the app configured `locales` — a transport that ignores it
still satisfies the contract, and serves a single-language site correctly.

The one exception is `getCollection`, which reads its locale from `params`
alongside `filter` / `offset` / `limit`: for a list the language narrows the
window, and `params` is what the client hashes into its cache key.

```js
// my-transport.js
/** @returns {import("inscribed").CmsTransport} */
export function createMyTransport({ baseUrl }) {
  const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

  return {
    async getContent(slug, opts = {}) {
      const res = await fetch(`${baseUrl}/pages?slug=${slug}`, {
        headers: { ...auth(opts.accessToken) },
      });
      if (!res.ok) throw new Error(`getContent ${res.status}`);
      return res.json(); // must match the ContentResponse shape
    },
    // ...the remaining methods
  };
}
```

Inject it on **both** sides:

```jsx
// client: pass to your provider
<CmsProvider config={cmsConfig} transport={createMyTransport({ baseUrl })}>
  {children}
</CmsProvider>
```

```js
// server: pass at the call site (server-only objects can carry functions)
import { getCmsPageBlocks } from "inscribed/server";

const transport = createMyTransport({ baseUrl });
const blocks = await getCmsPageBlocks({ ...cmsConfig, transport }, slug);
```

`createCmsPage` also accepts a `transport` option for its server-side SSR fetch.

**Errors are part of the contract.** Throw `CmsApiError` (exported from
`inscribed`) for any non-2xx, so the UI branches the same way whatever the
backend: `isConflict` drives the save-conflict flow, `isForbidden` the
permission banner. A **409 from `updateContent`** should name the blocks the
write lost on, and omit the key when there is nothing block-level to report:

```json
{
  "status": 409,
  "detail": "Version conflict",
  "conflicts": [{ "path": "hero.title", "expected": 4, "provided": 1 }]
}
```

Callers read the parsed array as `error.conflicts`, `null` when the body carried
no key at all. That difference is what decides between resolving block by block
and asking for a plain retry, so an empty array is not a substitute for omitting
it.

> **Note:** the `cms-sync` CLI and `syncAll` target the REST `POST /cms/sync`
> shape, which takes the **complete** manifest array and reconciles against it -
> slugs/blocks absent from the array are soft-deleted, reappearing ones restored
> (with their content), and an empty array marks everything deleted. A fully
> custom backend can implement `syncManifests` and call
> `syncCmsManifest(config, manifests)` from its own pipeline.

## Package entry points

inscribed ships several entry points so server-only code never leaks into the client
bundle:

| Import | Side | Highlights |
| ------ | ---- | ---------- |
| `inscribed` | client | `CmsProvider`, `EditableRegion`, `EditableList`, `CmsGroup`, `useCmsContent`, `useCmsBlock`, `useCmsAdmin`, `useCmsRoute`, `useCountdown`, `createCmsConfig`, `CmsApiError`, block helpers (`getBlock`, `getBlockValue`, `groupBlocksByPrefix`, `indexBlocksByPath`) |
| `inscribed/collections` | client | `CollectionProvider`, `CollectionRegion`, `CollectionItem`, `CollectionField`, `CollectionComposer`, `useCollection`, `useCollectionItem`, `useCollectionRecord`, `useMyCollections`, `useCollectionCreate`, `CollectionFieldsForm` (+ `seedValues`, `buildPayload`, `requiredMissing`, `humanizeCollectionError`) |
| `inscribed/server` | server only | `getCmsContent`, `getCmsPageBlocks`, `getCmsCollection`, `getCmsCollectionItem`, `syncCmsManifest`, `syncAll`, `cmsCacheTag`, `cmsCollectionTag`, `cmsCollectionItemTag` |
| `inscribed/page` | server only | `createCmsPage` (returns `CmsPage`, `localePath`, `getCmsRoute`, and the server collection bindings), `createCmsConfig` |
| `inscribed/actions` | Server Action | `revalidateCmsSlug`, `revalidateCmsCollection` |
| `inscribed/middleware` | edge | `createCmsMiddleware` |

Import `inscribed/server` and `inscribed/page` only from Server Components, route
handlers, or build scripts, never from a Client Component.

## CLI: `cms-sync`

Discovers `<EditableRegion>` (and `useCmsBlock` metadata) declarations under
`app/`, rooted at each `page.{js,jsx,ts,tsx}` file, and pushes the manifest to
the backend. When discovery finds no regions at all it exits with an error
instead of pushing, since reconciling against an empty manifest soft-deletes
every remote slug.

```
cms-sync [options]

Options:
  --app-root <path>     Directory to scan (default: ./app)
  --env <path>          dotenv file to preload (default: ./.env.local)
  --global-slug <name>  Slug for scope="global" blocks (default: __global)
  --dry-run             Print the discovered manifest as JSON without syncing
  --allow-empty         Sync even when discovery finds nothing
  --help, -h            Show help

Environment:
  CMS_URL               Backend base URL (default: http://localhost:5000)
```

Each discovered slug is printed beside the page file it was derived from, so
`--dry-run` is where you check a slug that came out wrong:

```
[inscribed-discover] /            6 block(s)  (app/[locale]/page.jsx)
[inscribed-discover] /haber-lab   1 block(s)  (app/[locale]/haber-lab/page.jsx)
```

The service token for `POST /cms/sync` (and optional failure diagnostics) comes
from an optional `cms.config.js` in the project root; the CLI is a plain Node
binary, so it loads that module rather than receiving props. `locales` lives
here too because discovery needs it: it is what tells the scanner a leading
`[locale]` segment is a language rather than part of the slug.

```js
// cms.config.js
export const getServiceToken = async () => "...";  // default: no token
export const onSyncError = (err) => { /* ... */ };  // optional
export const locales = ["tr", "en"];                // optional, first is default
```

## TypeScript

inscribed is written in JavaScript with JSDoc and ships generated `.d.ts`
declarations for every entry point, so you get full type information and editor
autocomplete with no extra setup. Public types such as `CmsTransport`,
`CmsConfig`, and `BlockType` are importable:

```ts
import type { CmsTransport } from "inscribed";
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev
setup, build/test workflow, the seam architecture, and commit conventions.

## License

[LGPL-3.0-or-later](./LICENSE) © Fatih Naz
