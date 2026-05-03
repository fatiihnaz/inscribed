/**
 * @file `createCmsPage` factory - centralise per-page CMS boilerplate.
 *
 * SERVER ONLY - published under `@skylab/cms/page`.
 *
 * Define one factory call (typically `app/lib/cms.jsx`) with your config,
 * session strategy, and revalidation; afterwards every page reduces to:
 *
 *   import { CmsPage } from "../lib/cms.jsx";
 *   import { EditableRegion } from "@skylab/cms";
 *
 *   export default function Page() {
 *     return (
 *       <CmsPage slug="/foo">
 *         <main>
 *           <EditableRegion blockPath="hero.title" as="h1" />
 *         </main>
 *       </CmsPage>
 *     );
 *   }
 *
 * The `slug` prop is optional. When omitted, the helper reads the active
 * pathname from the `x-pathname` request header - this lets you wrap the
 * root layout once and let every static page inherit it. The header is not
 * standard; the consumer must populate it via a tiny middleware:
 *
 *   // middleware.js
 *   import { NextResponse } from "next/server";
 *   export function middleware(req) {
 *     const headers = new Headers(req.headers);
 *     headers.set("x-pathname", req.nextUrl.pathname);
 *     return NextResponse.next({ request: { headers } });
 *   }
 *
 * Dynamic routes (`/news/[id]`) still need explicit `<CmsPage slug="/news/[id]">`
 * because the header carries the concrete path, not the manifest template.
 *
 * `Provider` is passed in by the caller (rather than imported here) so the
 * `"use client"` boundary in `@skylab/cms/nextauth` (or a custom provider
 * module) stays intact - tsup does not preserve `"use client"` across entry
 * boundaries when bundling, but consumer-side imports do.
 */

import { headers } from "next/headers";

import { revalidateCmsSlug } from "./actions.js";
import { getCmsPageBlocks } from "./get-content.js";

const PATHNAME_HEADER = "x-pathname";

/**
 * @import { CmsConfig } from "../lib/config.js"
 */

/**
 * @typedef {Object} CreateCmsPageOptions
 * @property {*} Provider
 *   The CMS provider component - typically `NextAuthCmsProvider` from
 *   `@skylab/cms/nextauth`, or your own wrapper around `CmsProvider`.
 * @property {CmsConfig | { baseUrl: string }} config
 * @property {() => Promise<*|null>} [getSession]
 *   Resolve the active session (e.g. `() => getServerSession(authOptions)`).
 *   Omit for public-only setups - every visitor is treated as non-admin.
 * @property {(session: *) => boolean} [deriveAdmin]
 *   Default: `session != null`.
 * @property {(session: *) => string | null} [deriveUserSub]
 *   Default: `session?.user?.id ?? null`.
 * @property {(slug: string) => void | Promise<void>} [onAfterSave]
 *   Server Action invoked after a successful admin save. Default:
 *   `revalidateCmsSlug` from `@skylab/cms/actions`.
 */

/**
 * @param {CreateCmsPageOptions} options
 * @returns {(props: { slug?: string, children: React.ReactNode }) => Promise<React.ReactElement>}
 */
export function createCmsPage(options) {
  const { Provider, config, getSession,
    deriveAdmin = (session) => session != null,
    deriveUserSub = (session) => session?.user?.id ?? null,
    onAfterSave = revalidateCmsSlug,
  } = options;

  if (!Provider) {
    throw new Error("createCmsPage: `Provider` option is required");
  }
  if (!config) {
    throw new Error("createCmsPage: `config` option is required");
  }

  return async function CmsPage({ slug, children }) {
    const resolvedSlug = slug ?? (await resolveSlugFromHeaders());
    const session = getSession ? await getSession() : null;

    let initialBlocks = [];
    try {
      initialBlocks = await getCmsPageBlocks(config, resolvedSlug);
    } catch {
      // Backend offline or page not yet synced - render with empty blocks.
    }

    return (
      <Provider config={config} isAdmin={deriveAdmin(session)} userSub={deriveUserSub(session)}
        initialBlocks={initialBlocks} onAfterSave={onAfterSave}
      >
        {children}
      </Provider>
    );
  };
}

/**
 * Read the request pathname out of the `x-pathname` header that the
 * consumer's middleware populates. `await` covers both Next 14 (sync
 * `headers()`) and Next 15 (async `headers()`).
 *
 * In development, surface a clear warning when the header is missing so
 * the consumer doesn't spend hours wondering why every page resolves to
 * `/`. In production, fall back silently to `/`.
 *
 * @returns {Promise<string>}
 */
async function resolveSlugFromHeaders() {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER);
  if (pathname) return pathname;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[skylab-cms] <CmsPage> rendered without a slug prop and no "${PATHNAME_HEADER}" ` +
        "request header was found. Add middleware that copies the pathname into the " +
        "request headers, or pass slug={...} explicitly. Falling back to \"/\".",
    );
  }
  return "/";
}