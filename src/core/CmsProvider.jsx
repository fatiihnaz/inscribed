"use client";

/**
 * @file Top-level provider owning CMS state. Mount once near the root. Holds
 * the blocks map, active-block selection, draft autosave, and the refetch
 * token. The admin drawer is lazy-loaded so public visitors don't pay for it.
 *
 * All of that state lives in stores (see `shared/state/store.js`), not React
 * state, and the context carries only the handles and setters. A write
 * therefore reaches the components that selected the changed slice and nobody
 * else: a keystroke touches one region, a panel toggle touches the panel, an
 * autosave roundtrip touches the block it saved.
 *
 * This is the composition root: it mounts `admin/Drawer` behind `next/dynamic`
 * and wraps the tree in the `collections` provider when the app passed one. It
 * never imports that provider itself, so an app without collections keeps the
 * whole layer out of its bundle.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { CmsContext, useCmsContext } from "../shared/state/cms-context.js";
import { ensureCmsConfig } from "../shared/config.js";
import { normalizePanels } from "../shared/panels.js";
import { globalsKey, matchCmsRoute, parseRouteKey, resolveCmsRoute, routeKey } from "../shared/route.js";
import { buildThemeCss } from "../shared/style/theme.js";
import { PAGE_SHELL_CLASS } from "../shared/style/layout-css.js";
import { createRestTransport } from "../defaults/transport.js";
import { getBrowserAuth } from "../defaults/browser-auth.js";
import { EMPTY_SITE, reseedSite, seedSite, siteSlugs } from "./site-blocks.js";
import { mergeRouteBlocks, readBlock } from "./blocks.js";
import { deepEqual } from "../shared/util/deep-equal.js";
import { stableStringify } from "../shared/util/stable-stringify.js";
import { CmsApiError } from "../shared/contracts/errors.js";
import { createStore, useStoreSelector } from "../shared/state/store.js";
import { createDraftQueue } from "../shared/state/draft-queue.js";
import { contentDraftKey, parseTranslationDraftKey } from "../shared/state/draft-keys.js";
import { resolveBlockValue } from "./resolve.js";
import { useSiteBlocks } from "./hooks/use-site-blocks.js";

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { BlockResponse, ItemSchema } from "../shared/contracts/schemas.js"
 * @import { ChoiceSourceEntry } from "../shared/state/cms-context.js"
 */

const AdminDrawer = dynamic(
  () => import("../admin/Drawer.jsx").then((m) => m.Drawer),
  { ssr: false },
);

// Both are admin-only and both were static imports, so a visitor's bundle
// carried the editor stylesheet and the panel's string catalogs for surfaces
// they can never reach. Split out, they follow the gate the render already had.
//
// `lazy` rather than `next/dynamic`, unlike the drawer above: these two are
// content, not a client-only surface, so there is no reason to keep them out of
// the server render of a session that already knows it is an admin.
const AdminStyles = lazy(() =>
  import("../admin/AdminStyles.jsx").then((m) => ({ default: m.AdminStyles })),
);
const SessionExpiredNotice = lazy(() =>
  import("../admin/SessionExpiredNotice.jsx").then((m) => ({ default: m.SessionExpiredNotice })),
);

// `useMemo` is a cache, not a guarantee: React may drop and recompute it, which
// for a store would swap the object every subscriber holds. A ref pins it.
const UNSET = Symbol("unset");

/**
 * @template T
 * @param {() => T} create
 * @returns {T}
 */
/** Shared empty map for the "route not fetched yet" reads below. */
const EMPTY_BLOCKS = new Map();

/** Stable, so resetting it to empty is a no-op when it already is. */
const NO_LOCALES = /** @type {string[]} */ ([]);

function useConstant(create) {
  const ref = useRef(/** @type {T | typeof UNSET} */ (UNSET));
  if (ref.current === UNSET) ref.current = create();
  return /** @type {T} */ (ref.current);
}

/**
 * @param {Object} props
 * @param {CmsConfig | { baseUrl: string }} props.config
 * @param {string|null} [props.userSub]
 * @param {boolean} [props.isAdmin]
 * @param {import("./site-blocks.js").SiteContent} [props.initialSite]
 *   The whole site in the language on screen, as `<CmsPage>` read it: `pages`
 *   (routes) and `global` (everything that is not one). Seeded into the store
 *   before first paint, so regions render real values during SSR and every
 *   navigation renders from what is already here.
 * @param {(slug: string, locale?: string) => void | Promise<void>} [props.onAfterSave]   Server Action run after a save, typically `revalidateCmsSlug`. `locale` is undefined on a single-language site.
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the user's JWT, added as `Authorization: Bearer` on writes. When omitted and `config.clientKey` is set, the built-in browser auth (reference backend `/auth/*`) takes over; omit both for public mode.
 * @param {import("../shared/contracts/transport.js").CmsTransport} [props.transport]   Custom client transport. Defaults to REST from `config`. Passed here, not via `config`, because it holds functions that can't cross the RSC boundary.
 * @param {{ name: string|null, email: string|null, image: string|null } | null} [props.userInfo]   Identity for the admin panel footer. Null in public mode.
 * @param {(key: string, slug?: string) => void | Promise<void>} [props.onAfterCollectionSave]   Server Action run after a collection record is published, typically `revalidateCmsCollection` from `inscribed/actions`.
 * @param {React.ComponentType<{ children: React.ReactNode }>} [props.collections]   Opt in to collections by passing `CollectionProvider` from `inscribed/collections`. Handed in rather than imported here so an app without collections never pulls the layer into its bundle. `createCmsPage({ collections })` passes it for you.
 * @param {import("../shared/panels.js").CmsPanel[]} [props.panels]   Admin areas of your own, added to the drawer's rail beside Page and Collections; each body reads its API from `useCmsPanel()` (`inscribed/panels`). `createCmsPage({ panels })` passes them for you.
 * @param {() => void} [props.onSignOut]   Invoked by the admin panel's logout button.
 * @param {React.ReactNode} props.children
 */
export function CmsProvider({
  config,
  userSub: userSubProp = null,
  isAdmin: isAdminProp = false,
  initialSite = EMPTY_SITE,
  onAfterSave,
  onAfterCollectionSave,
  getAccessToken,
  transport,
  userInfo: userInfoProp = null,
  collections: CollectionsRoot,
  panels,
  onSignOut,
  children,
}) {
  // Validated here as well as in `createCmsPage`: an app can wire this provider
  // directly, and that is the other place the list gets written.
  const normalizedPanels = useMemo(() => normalizePanels(panels), [panels]);
  // `config` arrives serializable across the RSC boundary. The transport holds
  // functions, so we build it here on the client and augment it onto the config
  // the tree reads through context. A custom `transport` prop overrides it.
  //
  // Keyed on the config's *contents*, never its identity. Serialization drops
  // the freeze, so every server render hands this a new object saying exactly
  // the same thing: a publish, a `router.refresh()`, any Server Action. On
  // identity that re-normalized each time and swapped the context value, which
  // re-rendered every consumer and re-ran the effects keyed on `config` — the
  // editor's block fetch and the collections `/me` read both went again, per
  // refresh. On contents it settles after the first render and stays put, which
  // also makes an inline `config={{ baseUrl }}` literal free rather than a
  // footgun worth warning about.
  const configKey = stableStringify(config);
  // Pinned in a ref rather than memoised: `useMemo` is a cache React may drop,
  // and recomputing would mint a new frozen object, which is the one thing this
  // is here to prevent. The write is idempotent for a given key.
  const configRef = useRef(/** @type {{ key: string, value: CmsConfig } | null} */ (null));
  if (configRef.current === null || configRef.current.key !== configKey) {
    configRef.current = { key: configKey, value: ensureCmsConfig(config) };
  }
  const baseConfig = configRef.current.value;
  const normalizedConfig = useMemo(
    () => ({
      ...baseConfig,
      transport: transport ?? baseConfig.transport ?? createRestTransport(baseConfig),
    }),
    [baseConfig, transport],
  );

  // Emit the theme overrides once as a `:root` block of `--ins-*` vars. At the
  // provider root (not the drawer) so page-side affordances pick them up too.
  const themeCss = useMemo(() => buildThemeCss(baseConfig.theme), [baseConfig.theme]);

  // ---- Built-in browser auth (reference backend `/auth/*`) ----------------
  //
  // Active only when the consumer brings no auth of their own. Admin-ness is
  // decided here on the client because the refresh cookie belongs to the API
  // origin: the app's server never sees it, so SSR always renders public and
  // the drawer mounts a beat after hydration.
  const hasConsumerAuth = getAccessToken != null;
  const browserAuth = useMemo(
    () =>
      !hasConsumerAuth && baseConfig.clientKey
        ? getBrowserAuth({ baseUrl: baseConfig.baseUrl, clientKey: baseConfig.clientKey })
        : null,
    [hasConsumerAuth, baseConfig.baseUrl, baseConfig.clientKey],
  );
  const [browserSession, setBrowserSession] = useState(
    /** @type {{ userSub: string|null, userInfo: { name: string|null, email: string|null, image: null } } | null} */ (null),
  );
  // Raised when the session dies underneath an active admin (refresh → 401:
  // revoked, reuse-detection, or 30-day expiry) so the editor learns why the
  // drawer vanished. Deliberate logouts (this tab or another) stay silent.
  const [sessionExpired, setSessionExpired] = useState(false);
  const browserSessionRef = useRef(browserSession);
  browserSessionRef.current = browserSession;

  // Adopt the held token's identity if it passes the role gate. Also serves
  // another tab's sign-in, where this tab holds no token yet: refresh first.
  const adoptBrowserSession = useCallback(async () => {
    const auth = browserAuth;
    if (!auth) return;
    let claims = auth.claims();
    if (!claims) {
      if (!(await auth.refresh())) return;
      claims = auth.claims();
      if (!claims) return;
    }
    if (browserSessionRef.current?.userSub === (claims.sub ?? null)) {
      setSessionExpired(false);
      return;
    }
    // The backend renamed roles to capabilities in its admin API, but the JWT
    // still carries them under the legacy `roles` claim.
    const capabilities = Array.isArray(claims.roles) ? claims.roles : [];
    // `azp` must match this site's clientKey: on a shared API origin the cookie
    // may belong to another client, whose capabilities say nothing here.
    const mayEdit =
      claims.azp === baseConfig.clientKey && capabilities.includes("content:write");
    if (!mayEdit) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(
          `[inscribed] no content:write for "${baseConfig.clientKey}" (azp "${claims.azp}", roles ${JSON.stringify(capabilities)}) - add an editor membership.`,
        );
      }
      return;
    }
    setSessionExpired(false);
    setBrowserSession({
      userSub: claims.sub ?? null,
      userInfo: {
        name: claims.name ?? null,
        email: claims.email ?? null,
        image: null,
      },
    });
  }, [browserAuth, baseConfig.clientKey]);

  // Session lifecycle: every adoption/teardown flows through auth transitions,
  // so our own refresh, another tab's login/logout, and mid-edit expiry all
  // land in one handler. Must subscribe before the entry probe below fires.
  useEffect(() => {
    if (!browserAuth) return;
    return browserAuth.onChange((authenticated, reason) => {
      if (authenticated) {
        void adoptBrowserSession();
        return;
      }
      if (reason === "expired" && browserSessionRef.current) setSessionExpired(true);
      setBrowserSession(null);
    });
  }, [browserAuth, adoptBrowserSession]);

  // Entry probe on mount: ?cms-logout → sign out, ?cms-login → interactive
  // login, ?cms-auth=done → back from the backend callback, session hint →
  // silent resume. Anonymous visitors (none of these) trigger zero auth
  // requests. Adoption happens in the onChange handler above, not here.
  useEffect(() => {
    if (!browserAuth) return;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      // A ?cms-logout link kills the session before any resume probe: strip the
      // marker and return so it never falls through into a silent re-adoption.
      if (params.has("cms-logout")) {
        await browserAuth.logout();
        stripAuthParams();
        return;
      }
      const explicitLogin = params.has("cms-login");
      const returning = params.get("cms-auth") === "done";
      if (!explicitLogin && !returning && !browserAuth.hasSessionHint()) return;

      const ok = await browserAuth.refresh();
      if (explicitLogin && !ok) {
        browserAuth.login(); // full-page redirect; comes back with ?cms-auth=done
        return;
      }
      // Landing with the marker but failing refresh means the backend's login
      // succeeded and the token exchange broke: almost always the cookie was
      // dropped (Secure cookie on http) or CORS blocked the call.
      if (returning && !ok && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(
          `[inscribed] login returned but /auth/refresh gave no session - check the cookie flags and CORS.`,
        );
      }
      if (explicitLogin || returning) stripAuthParams();
    })();
  }, [browserAuth]);

  const browserSignOut = useCallback(async () => {
    if (!browserAuth) return;
    await browserAuth.logout();
    setBrowserSession(null);
  }, [browserAuth]);

  // Browser session wins over the (always-public) SSR props when active.
  const isAdmin = browserSession != null || isAdminProp;
  const userSub = browserSession ? browserSession.userSub : userSubProp;
  const userInfo = browserSession ? browserSession.userInfo : userInfoProp;

  // ---- Stores ------------------------------------------------------------
  //
  // Everything that changes while the app runs lives here rather than in React
  // state, so a write reaches only the components selecting the changed slice.
  // The context value below carries the handles and the setters, and never
  // changes identity once the session resolves.

  const pathname = usePathname() ?? "/";

  // Which slugs the site has content for: what a pathname is matched against,
  // so `/news/123` finds `/news/[id]` without the page saying so. Its own store
  // because `useCmsRoute` reads it from any component, and it only ever moves
  // when the server hands over a new site.
  const slugsStore = useConstant(() => createStore(siteSlugs(initialSite)));
  const slugs = useStoreSelector(slugsStore, (s) => s);
  const route = useMemo(
    () => matchCmsRoute(pathname, normalizedConfig, slugs),
    [pathname, normalizedConfig, slugs],
  );
  const { slug: routeSlug, locale } = route;
  // Where this route's blocks live in the store, and where the language's
  // globals do. A block is looked for in the first, then the second.
  const currentKey = routeKey(routeSlug, locale);
  const currentGlobalsKey = globalsKey(locale);
  // Read by the write paths below, which run after a render rather than during
  // one, so they want the key as it is now and not as it was when they were
  // built.
  const draftKeyRef = useRef(currentKey);
  draftKeyRef.current = currentKey;
  const globalsKeyRef = useRef(currentGlobalsKey);
  globalsKeyRef.current = currentGlobalsKey;

  // Keyed by `routeKey(slug, locale)`, then by blockPath, and it holds the
  // whole site from the first render. That is what makes a navigation free:
  // the new route's selector already resolves, with no fetch and no effect in
  // between to leave a frame of placeholders.
  //
  // The globals get one entry of their own rather than a copy inside every
  // page, so a header edit reaches every route at once and a route the site has
  // no entry for still has a header.
  const blocksStore = useConstant(() =>
    createStore(
      /** @type {Map<string, Map<string, BlockResponse>>} */ (
        seedSite(initialSite, resolveCmsRoute(pathname, normalizedConfig).locale)
      ),
    ),
  );
  const contentDraftsStore = useConstant(() =>
    createStore(/** @type {Map<string, *>} */ (new Map())),
  );
  // Edits typed into a block's copy in a language the editor is not reading,
  // keyed by `translationDraftKey`, until their autosave lands. A separate map
  // from `contentDraftsStore` because everything subscribed to that one assumes
  // a bare blockPath on the current route: its autosave collector would PUT
  // these into the wrong locale's draft slot.
  const translationDraftsStore = useConstant(() =>
    createStore(/** @type {Map<string, *>} */ (new Map())),
  );
  const uiStore = useConstant(() =>
    createStore(/** @type {import("../shared/state/cms-context.js").CmsUiState} */ ({
      activeBlock: null,
      pendingBlock: null,
      activeListItem: null,
      isDrawerOpen: false,
      draftSyncStatus: "idle",
      conflictBlocks: new Set(),
      includedLocales: NO_LOCALES,
      refetchToken: 0,
      siteLoading: false,
      siteError: null,
    })),
  );
  // One lane per slug for block-draft writes. Pinned for the same reason the
  // stores are: a queue React could drop would strand in-flight requests.
  const draftQueue = useConstant(() => createDraftQueue());
  useEffect(() => () => draftQueue.dispose(), [draftQueue]);

  const registryStore = useConstant(() =>
    createStore(/** @type {import("../shared/state/cms-context.js").CmsRegistryState} */ ({
      itemSchemas: new Map(),
      choiceSources: new Map(),
      editorVisibility: new Map(),
    })),
  );

  const setDraftsState = contentDraftsStore.set;
  const setTranslationDraftsState = translationDraftsStore.set;

  // Write what a read brought back: one entry per page it carried, plus the
  // language's globals. Entries it says nothing about stay, which is what lets
  // the translation panel commit one page of another language without
  // disturbing the one on screen.
  //
  // Authoritative about drafts, unlike the `reseedSite` above: this is the
  // editor's own read, so what it says about `draftValue` replaces what was
  // there rather than being folded onto it.
  const commitSite = useCallback(
    /** @param {import("./site-blocks.js").SiteContent} site @param {string|null} locale */
    (site, locale) => {
      blocksStore.set((s) => {
        const next = new Map(s);
        for (const [key, blocks] of seedSite(site, locale)) next.set(key, blocks);
        return next;
      });
    },
    [blocksStore],
  );

  const commitSiteSlugs = useCallback(
    /** @param {import("./site-blocks.js").SiteContent} site */
    (site) => slugsStore.set(siteSlugs(site)),
    [slugsStore],
  );

  // Patch blocks by path, for the autosave mirror and discard. A mapper
  // returning null leaves that block alone.
  //
  // By path rather than by entry, because a caller holds a set of blockPaths
  // and has no reason to know which of the two entries holds each one. It is
  // also what makes a header's autosave reach every route at once: the globals
  // are one entry, so patching it patches everywhere.
  const patchBlocks = useCallback(
    /**
     * @param {string[]} paths
     * @param {(block: BlockResponse, path: string) => BlockResponse | null} mapBlock
     */
    (paths, mapBlock) => {
      const keys = [draftKeyRef.current, globalsKeyRef.current];
      blocksStore.set((s) => {
        /** @type {Map<string, Map<string, BlockResponse>> | null} */
        let next = null;
        for (const key of keys) {
          const prev = s.get(key);
          if (!prev) continue;
          /** @type {Map<string, BlockResponse> | null} */
          let entry = null;
          for (const path of paths) {
            const current = prev.get(path);
            if (!current) continue;
            const updated = mapBlock(current, path);
            if (!updated || updated === current) continue;
            entry ??= new Map(prev);
            entry.set(path, updated);
          }
          if (!entry) continue;
          next ??= new Map(s);
          next.set(key, entry);
        }
        return next ?? s;
      });
    },
    [blocksStore],
  );

  // What a page sees: its own blocks and the language's globals, as one map.
  // Only ever called off the render path (a flush, a publish), where the
  // allocation is free; a store selector would have to return a stable
  // reference and so reads the two entries separately instead.
  const readRouteBlocks = useCallback(
    () => {
      const state = blocksStore.get();
      return mergeRouteBlocks(
        state.get(draftKeyRef.current) ?? EMPTY_BLOCKS,
        state.get(globalsKeyRef.current) ?? EMPTY_BLOCKS,
      );
    },
    [blocksStore],
  );

  /** @param {Partial<import("../shared/state/cms-context.js").CmsUiState>} patch */
  const patchUi = useCallback(
    (patch) => {
      uiStore.set((s) => {
        for (const key of /** @type {(keyof typeof patch)[]} */ (Object.keys(patch))) {
          if (s[key] !== patch[key]) return { ...s, ...patch };
        }
        return s;
      });
    },
    [uiStore],
  );

  const registerItemSchema = useCallback(
    /** @param {string} blockPath @param {ItemSchema} schema */
    (blockPath, schema) => {
      registryStore.set((s) => {
        if (s.itemSchemas.get(blockPath) === schema) return s;
        const itemSchemas = new Map(s.itemSchemas);
        itemSchemas.set(blockPath, schema);
        return { ...s, itemSchemas };
      });
    },
    [registryStore],
  );

  const unregisterItemSchema = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      registryStore.set((s) => {
        if (!s.itemSchemas.has(blockPath)) return s;
        const itemSchemas = new Map(s.itemSchemas);
        itemSchemas.delete(blockPath);
        return { ...s, itemSchemas };
      });
    },
    [registryStore],
  );

  // Where a Select or StringArray block gets its choices. Same shape as the row
  // schema above and for the same reason: the list lives with the page that
  // declares the block, and the drawer has no other way to learn it.
  const registerChoiceSource = useCallback(
    /** @param {string} blockPath @param {ChoiceSourceEntry} entry */
    (blockPath, entry) => {
      registryStore.set((s) => {
        if (s.choiceSources.get(blockPath) === entry) return s;
        const choiceSources = new Map(s.choiceSources);
        choiceSources.set(blockPath, entry);
        return { ...s, choiceSources };
      });
    },
    [registryStore],
  );

  const unregisterChoiceSource = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      registryStore.set((s) => {
        if (!s.choiceSources.has(blockPath)) return s;
        const choiceSources = new Map(s.choiceSources);
        choiceSources.delete(blockPath);
        return { ...s, choiceSources };
      });
    },
    [registryStore],
  );

  const registerEditorVisibility = useCallback(
    /** @param {string} blockPath @param {"hidden"|"readonly"} mode */
    (blockPath, mode) => {
      registryStore.set((s) => {
        if (s.editorVisibility.get(blockPath) === mode) return s;
        const editorVisibility = new Map(s.editorVisibility);
        editorVisibility.set(blockPath, mode);
        return { ...s, editorVisibility };
      });
    },
    [registryStore],
  );

  const unregisterEditorVisibility = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      registryStore.set((s) => {
        if (!s.editorVisibility.has(blockPath)) return s;
        const editorVisibility = new Map(s.editorVisibility);
        editorVisibility.delete(blockPath);
        return { ...s, editorVisibility };
      });
    },
    [registryStore],
  );

  // A new site from the server (the layout re-rendered: `router.refresh()`, or
  // a regeneration after publish) replaces every entry, since it is the truth
  // for all of them. Lazy init only runs once on mount, so without this the
  // page would keep rendering the blocks it mounted with. `reseedSite` is what
  // keeps an editor's unpublished drafts through it: the incoming site is the
  // published one and says nothing about them.
  const initialSiteRef = useRef(initialSite);
  useEffect(() => {
    if (initialSite === initialSiteRef.current) return;
    initialSiteRef.current = initialSite;
    const seededLocale = resolveCmsRoute(pathname, normalizedConfig).locale;
    slugsStore.set(siteSlugs(initialSite));
    blocksStore.set((prev) => reseedSite(prev, initialSite, seededLocale));
    // `pathname` is the route the new site arrived on, read, never a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSite, blocksStore, slugsStore, normalizedConfig]);

  // What a navigation leaves behind. Nothing is fetched: the store already
  // holds every route, so the new page renders on the same commit.
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    // Conflicts go with the drafts they were raised against. `pendingBlock` is
    // deliberately left alone: it names a block on the route being navigated
    // *to*, so clearing it here would cancel the very jump this navigation is.
    //
    // Unsaved translations are left for their autosave, which writes them to
    // their own language's draft whichever page is on screen. Which languages
    // the next publish includes is a choice made about the page being left.
    patchUi({ activeBlock: null, conflictBlocks: new Set(), includedLocales: NO_LOCALES });
    setDraftsState(new Map());
  }, [pathname, setDraftsState, patchUi]);

  // Drop drafts for blocks that no longer exist (e.g. after a manifest sync
  // removed one). Subscribed rather than keyed on a render value, since blocks
  // now change without re-rendering the provider. Pathname-change drafts are
  // already cleared above.
  const pruneKeyRef = useRef(currentKey);
  pruneKeyRef.current = currentKey;
  useEffect(() => {
    const prune = () => {
      // Only the route being edited: drafts belong to the page they were typed
      // on, and navigation already clears them. The globals count too, or a
      // draft on the header would read as a block that no longer exists.
      const state = blocksStore.get();
      const own = state.get(pruneKeyRef.current);
      if (!own) return;
      const globals = state.get(globalsKeyRef.current) ?? EMPTY_BLOCKS;
      setDraftsState((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Map();
        for (const [path, value] of prev) {
          if (own.has(path) || globals.has(path)) next.set(path, value);
          else changed = true;
        }
        return changed ? next : prev;
      });
    };
    prune();
    return blocksStore.subscribe(prune);
  }, [blocksStore, setDraftsState]);

  // Stash callbacks in refs so prop changes don't bust the memoised context
  // value (and thus don't spuriously re-render consumers).
  const onAfterSaveRef = useRef(onAfterSave ?? null);
  onAfterSaveRef.current = onAfterSave ?? null;

  const onAfterCollectionSaveRef = useRef(onAfterCollectionSave ?? null);
  onAfterCollectionSaveRef.current = onAfterCollectionSave ?? null;

  const getAccessTokenRef = useRef(getAccessToken ?? null);
  getAccessTokenRef.current = getAccessToken ?? browserAuth?.getAccessToken ?? null;

  const onSignOutRef = useRef(onSignOut ?? null);
  onSignOutRef.current = onSignOut ?? null;

  const triggerRefetch = useCallback(() => {
    uiStore.set((s) => ({ ...s, refetchToken: s.refetchToken + 1 }));
  }, [uiStore]);

  const setDraft = useCallback(
    /** @param {string} blockPath @param {*} value */
    (blockPath, value) => {
      setDraftsState((prev) => {
        const next = new Map(prev);
        next.set(blockPath, value);
        return next;
      });
    },
    [setDraftsState],
  );

  const clearDraft = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setDraftsState((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
        return next;
      });
    },
    [setDraftsState],
  );

  const clearDrafts = useCallback(() => {
    // Drops pending autosaves and marks in-flight ones stale, so a write that
    // is mid-await can't mirror its (now discarded) value back into the blocks.
    draftQueue.cancelAll();
    setDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
    setTranslationDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, [setDraftsState, setTranslationDraftsState, draftQueue]);

  const setTranslationDraft = useCallback(
    /** @param {string} key @param {*} value */
    (key, value) => {
      setTranslationDraftsState((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
    },
    [setTranslationDraftsState],
  );

  const clearTranslationDrafts = useCallback(
    /** @param {string[]} keys  Every key when omitted. */
    (keys) => {
      setTranslationDraftsState((prev) => {
        if (prev.size === 0) return prev;
        if (!keys) return new Map();
        const next = new Map(prev);
        let changed = false;
        for (const key of keys) changed = next.delete(key) || changed;
        return changed ? next : prev;
      });
    },
    [setTranslationDraftsState],
  );

  const setIncludedLocales = useCallback(
    /** @param {(prev: string[]) => string[]} update */
    (update) => {
      uiStore.set((s) => {
        const includedLocales = update(s.includedLocales);
        return includedLocales === s.includedLocales ? s : { ...s, includedLocales };
      });
    },
    [uiStore],
  );

  const setSiteStatus = useCallback(
    /** @param {boolean} siteLoading @param {Error|null} siteError */
    (siteLoading, siteError) => patchUi({ siteLoading, siteError }),
    [patchUi],
  );

  const setDrawerOpen = useCallback(
    /** @param {boolean} open */
    (open) => {
      // Closing cancels the in-progress edit so reopening lands on the block
      // list; one write so subscribers see both fields move together.
      patchUi(open ? { isDrawerOpen: true } : { isDrawerOpen: false, activeBlock: null });
    },
    [patchUi],
  );

  const setActiveListItem = useCallback(
    /** @param {{ path: string, index: number } | null} target */
    (target) => patchUi({ activeListItem: target }),
    [patchUi],
  );

  const setPendingBlock = useCallback(
    /** @param {string|null} blockPath */
    (blockPath) => patchUi({ pendingBlock: blockPath }),
    [patchUi],
  );

  const setBlockConflicts = useCallback(
    /** @param {string[]} paths */
    (paths) => {
      // Clearing an already-empty set would still hand every card a new Set and
      // wake them all, and a successful save clears on every run.
      if (paths.length === 0 && uiStore.get().conflictBlocks.size === 0) return;
      patchUi({ conflictBlocks: new Set(paths) });
    },
    [patchUi, uiStore],
  );

  const clearBlockConflict = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      const current = uiStore.get().conflictBlocks;
      if (!current.has(blockPath)) return;
      const next = new Set(current);
      next.delete(blockPath);
      patchUi({ conflictBlocks: next });
    },
    [patchUi, uiStore],
  );

  // Reads `isAdmin` through a ref so the callback (and with it the whole
  // context value) keeps one identity across a sign-in.
  const isAdminGateRef = useRef(isAdmin);
  isAdminGateRef.current = isAdmin;
  const setActiveBlock = useCallback(
    /** @param {string|null} blockPath */
    (blockPath) => {
      if (!isAdminGateRef.current) return;
      patchUi({ activeBlock: blockPath });
    },
    [patchUi],
  );

  const stableOnAfterSave = useCallback(
    /** @param {string} slug @param {string|null} [locale] */
    async (slug, locale) => {
      const fn = onAfterSaveRef.current;
      if (!fn) return;
      await fn(slug, locale ?? undefined);
    },
    [],
  );

  const stableGetAccessToken = useCallback(
    /** @returns {Promise<string>} */
    async () => {
      const fn = getAccessTokenRef.current;
      if (!fn) return "";
      return fn();
    },
    [],
  );

  const stableOnAfterCollectionSave = useCallback(
    /** @param {string} key @param {string} [slug] */
    async (key, slug) => {
      const fn = onAfterCollectionSaveRef.current;
      if (!fn) return;
      await fn(key, slug);
    },
    [],
  );

  const stableOnSignOut = useCallback(() => {
    const fn = onSignOutRef.current;
    if (fn) fn();
  }, []);

  // ---- Draft autosave (PUT /cms/draft, 1s after last edit) ---------------
  //
  // Each edit re-arms a 1s debounce; on fire we group dirty edits by slug and
  // PUT each. Block/version/config/route are read through refs so unrelated
  // re-renders don't reset the timer, only a real `drafts` mutation does.

  const setDraftSyncStatus = useCallback(
    /** @param {"idle"|"saving"|"saved"|"failed"} status */
    (status) => patchUi({ draftSyncStatus: status }),
    [patchUi],
  );

  // `draftKeyRef` and `globalsKeyRef` are pinned up with the route, since the
  // block writers need them before this point.
  const draftSlugRef = useRef(routeSlug);
  draftSlugRef.current = routeSlug;
  const draftLocaleRef = useRef(locale);
  draftLocaleRef.current = locale;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const draftConfigRef = useRef(normalizedConfig);
  draftConfigRef.current = normalizedConfig;

  // Pulse-and-reset for the status dot: drop back to idle ~0.9s after a
  // saved/failed signal so the flash is transient.
  const draftStatusResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  const flashDraftStatus = useCallback(
    /** @param {"saved"|"failed"} kind */
    (kind) => {
      setDraftSyncStatus(kind);
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
      draftStatusResetRef.current = setTimeout(() => {
        setDraftSyncStatus("idle");
        draftStatusResetRef.current = null;
      }, 900);
    },
    [setDraftSyncStatus],
  );

  useEffect(() => {
    return () => {
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
    };
  }, []);

  // Draft lanes that already answered a 409 with a refetch. One conflict gets
  // one re-base; a second means the refetch did not help, and re-arming the
  // lane again would just hammer the backend every second. Keyed by lane, not
  // slug, so a conflict in one locale doesn't spend the other's single retry.
  const conflictRetriedRef = useRef(/** @type {Set<string>} */ (new Set()));
  // One-shot blocks subscriptions waiting on those refetches, held so the
  // effect can drop them if it tears down first.
  const conflictWaitersRef = useRef(/** @type {Set<() => void>} */ (new Set()));

  // Drafts live in the store, so this effect subscribes (rather than depending
  // on `[drafts]`) and re-arms the debounce on each change. One queue key per
  // slug: pages save in parallel, but a slug's own writes stay in commit order,
  // so a fast typist can't land an older payload after a newer one.
  useEffect(() => {
    /**
     * Collect one slug's dirty blocks. Runs at flush time, not when the draft
     * lands: entries that stopped differing in the meantime are dropped here.
     *
     * Compared against the *effective* value (`draftValue ?? value`), not
     * `value`: an undo back to published while a server draft exists must still
     * send a request, so the backend draft gets cleared.
     *
     * @param {string} slug
     * @param {string} fallbackSlug   Slug for blocks that carry no `_slug` stamp.
     * @param {Map<string, import("../shared/contracts/schemas.js").BlockResponse>} blocks
     */
    const collectForSlug = (slug, fallbackSlug, blocks) => {
      /** @type {import("../shared/contracts/schemas.js").UpdateBlockItem[]} */
      const items = [];
      for (const [blockPath, value] of contentDraftsStore.get()) {
        const block = blocks.get(blockPath);
        if (!block) continue;
        if ((block._slug ?? fallbackSlug) !== slug) continue;
        if (deepEqual(value, resolveBlockValue(block))) continue;
        items.push({ blockPath, value, version: block.version });
      }
      return items;
    };

    /**
     * Drop draft entries that no longer say anything: the block's server draft
     * is gone and the local value is what is published. Per-block undo leaves
     * exactly such an entry behind (it pins the published value so a write
     * still in flight can't resurrect the text), and keeping it would pin the
     * block to a value the server may since have moved past.
     *
     * Only safe from inside a flush, which the queue chains behind the slug's
     * in-flight write: anywhere else `draftValue` can still be a round-trip out
     * of date. Scoped to this flush's slug for the same reason.
     *
     * @param {string} slug
     * @param {string} fallbackSlug   Slug for blocks that carry no `_slug` stamp.
     */
    const pruneSettledDrafts = (slug, fallbackSlug) => {
      const blocks = readRouteBlocks();
      setDraftsState((prev) => {
        /** @type {Map<string, *> | null} */
        let next = null;
        for (const [blockPath, value] of prev) {
          const block = blocks.get(blockPath);
          if (!block || (block._slug ?? fallbackSlug) !== slug) continue;
          if (block.draftValue != null) continue;
          if (!deepEqual(value, block.value)) continue;
          next ??= new Map(prev);
          next.delete(blockPath);
        }
        return next ?? prev;
      });
    };

    const arm = () => {
      if (!isAdminRef.current) return;
      const drafts = contentDraftsStore.get();
      if (drafts.size === 0) return;

      const blocks = readRouteBlocks();
      /** @type {Set<string>} */
      const slugs = new Set();
      for (const blockPath of drafts.keys()) {
        const block = blocks.get(blockPath);
        if (block) slugs.add(block._slug ?? draftSlugRef.current);
      }

      for (const slug of slugs) {
        draftQueue.schedule(contentDraftKey(slug, draftLocaleRef.current), async (ctx) => {
          const currentSlug = draftSlugRef.current;
          const currentLocale = draftLocaleRef.current;
          const currentBlocks = readRouteBlocks();
          const items = collectForSlug(slug, currentSlug, currentBlocks);
          if (items.length === 0) {
            pruneSettledDrafts(slug, currentSlug);
            return;
          }

          // Everything undone back to published: a silent backend cleanup, so
          // the status pill stays quiet rather than flashing a save.
          const isAllReset = items.every((item) => {
            const b = currentBlocks.get(item.blockPath);
            return b == null || deepEqual(item.value, b.value);
          });

          const accessToken = (await stableGetAccessToken()) || undefined;
          if (!isAllReset) setDraftSyncStatus("saving");

          try {
            await draftConfigRef.current.transport.updateDraft(
              { slug, blocks: items },
              { accessToken, locale: currentLocale ?? undefined },
            );
          } catch (err) {
            if (ctx.isStale()) return;
            // A conflict is not a dead request: the local draft is still the
            // user's text, only the version it was written against moved. Drop
            // it here and someone who is mid-sentence silently stops being
            // saved, so re-base on a refetch and send it again.
            if (
              err instanceof CmsApiError && err.isConflict &&
              !conflictRetriedRef.current.has(contentDraftKey(slug, currentLocale))
            ) {
              conflictRetriedRef.current.add(contentDraftKey(slug, currentLocale));
              // Re-arm when the fresh blocks actually land rather than after a
              // guessed delay: the retry is only worth sending with the
              // versions that refetch brings.
              const stopWaiting = blocksStore.subscribe(() => {
                conflictWaitersRef.current.delete(stopWaiting);
                stopWaiting();
                arm();
              });
              conflictWaitersRef.current.add(stopWaiting);
              triggerRefetch();
              setDraftSyncStatus("idle");
              return;
            }
            // eslint-disable-next-line no-console
            console.warn("[inscribed] draft autosave failed:", err);
            if (!isAllReset) flashDraftStatus("failed");
            return;
          }
          conflictRetriedRef.current.delete(contentDraftKey(slug, currentLocale));

          // A discard landed mid-flight: it already nulled `draftValue`, so
          // mirroring our sent values now would re-populate it and fight it.
          if (ctx.isStale()) {
            setDraftSyncStatus("idle");
            return;
          }

          // Mirror the backend's post-write state: each block gets
          // draftValue = the value sent, or null when that equals published
          // (the backend auto-cleans). Without it an undo would keep
          // `draftValue` set until the next refetch, leaving a stale dirty count.
          const sentByPath = new Map(items.map((item) => [item.blockPath, item.value]));
          patchBlocks([...sentByPath.keys()], (block, path) => {
            const sent = sentByPath.get(path);
            const draftValue = deepEqual(sent, block.value) ? null : sent;
            if (deepEqual(block.draftValue ?? null, draftValue)) return null;
            return { ...block, draftValue };
          });
          pruneSettledDrafts(slug, currentSlug);

          if (isAllReset) setDraftSyncStatus("idle");
          else flashDraftStatus("saved");
        });
      }
    };

    const stopArming = contentDraftsStore.subscribe(arm);
    const waiters = conflictWaitersRef.current;
    return () => {
      stopArming();
      for (const stopWaiting of waiters) stopWaiting();
      waiters.clear();
    };
  }, [
    contentDraftsStore, blocksStore, readRouteBlocks, patchBlocks, draftQueue, setDraftsState,
    stableGetAccessToken, flashDraftStatus, setDraftSyncStatus, triggerRefetch,
  ]);

  // Translations autosave as their own language's draft, on the lane that
  // language's page writes on: an edit made there later queues behind this one
  // rather than racing it. Nothing is flashed on the status pill, which speaks
  // for the page on screen.
  useEffect(() => {
    /**
     * Where one typed translation is written, and the row it overwrites.
     *
     * @param {string} key
     */
    const targetOf = (key) => {
      const parsed = parseTranslationDraftKey(key);
      if (!parsed) return null;
      const { slug: pageSlug, locale: target } = parseRouteKey(parsed.routeKey);
      if (!target) return null;
      const block = readBlock(blocksStore.get(), parsed.routeKey, globalsKey(target), parsed.blockPath);
      if (!block) return null;
      return {
        lane: contentDraftKey(block._slug ?? pageSlug, target),
        slug: block._slug ?? pageSlug,
        locale: target,
        route: parsed.routeKey,
        block,
      };
    };

    const arm = () => {
      if (!isAdminRef.current) return;
      /** @type {Map<string, { slug: string, locale: string }>} */
      const lanes = new Map();
      for (const key of translationDraftsStore.get().keys()) {
        const target = targetOf(key);
        if (target) lanes.set(target.lane, target);
      }

      for (const [lane, { slug, locale: target }] of lanes) {
        draftQueue.schedule(lane, async (ctx) => {
          /** @type {import("../shared/contracts/schemas.js").UpdateBlockItem[]} */
          const items = [];
          /** @type {Map<string, { route: string, blockPath: string, value: * }>} */
          const sent = new Map();
          for (const [key, value] of translationDraftsStore.get()) {
            const found = targetOf(key);
            if (!found || found.lane !== lane) continue;
            items.push({ blockPath: found.block.blockPath, value, version: found.block.version });
            sent.set(key, { route: found.route, blockPath: found.block.blockPath, value });
          }
          if (items.length === 0) return;

          try {
            const accessToken = (await stableGetAccessToken()) || undefined;
            await draftConfigRef.current.transport.updateDraft(
              { slug, blocks: items },
              { accessToken, locale: target },
            );
          } catch (err) {
            // Kept in the map: it still publishes from there, and the next edit
            // to that language tries the write again.
            // eslint-disable-next-line no-console
            console.warn("[inscribed] translation autosave failed:", err);
            return;
          }
          // A publish stood this lane down while the write was out, so what it
          // carried is already live, or already discarded.
          if (ctx.isStale()) return;

          // Mirror the backend, as the page's own lane does: the draft is the
          // value sent, or nothing when that is what is published.
          blocksStore.set((s) => {
            let next = s;
            for (const { route, blockPath, value } of sent.values()) {
              for (const entryKey of [route, globalsKey(target)]) {
                const entry = next.get(entryKey);
                const block = entry?.get(blockPath);
                if (!block) continue;
                const draftValue = deepEqual(value, block.value) ? null : value;
                if (!deepEqual(block.draftValue ?? null, draftValue)) {
                  if (next === s) next = new Map(s);
                  next.set(entryKey, new Map(entry).set(blockPath, { ...block, draftValue }));
                }
                break;
              }
            }
            return next;
          });
          // Only what is still the value sent: anything typed since has its own
          // write coming.
          setTranslationDraftsState((prev) => {
            let next = prev;
            for (const [key, { value }] of sent) {
              if (!prev.has(key) || !deepEqual(prev.get(key), value)) continue;
              if (next === prev) next = new Map(prev);
              next.delete(key);
            }
            return next;
          });
        });
      }
    };

    return translationDraftsStore.subscribe(arm);
  }, [translationDraftsStore, blocksStore, draftQueue, setTranslationDraftsState, stableGetAccessToken]);

  // Stand these blocks' slug lanes down once a publish has landed, the same
  // `cancel` + `enqueue` shape `useCollectionEditor.undoDraft` uses.
  //
  // `cancel` is for the write already in flight: it bumps the key's epoch, which
  // that write reads as `isStale()`, so it won't mirror its `draftValue` back
  // onto a block whose value was just published and leave it looking dirty until
  // the refetch lands.
  //
  // The DELETE is for the same write's other half. Cancelling cannot recall a
  // request already on the wire, and that one reaches the backend after the
  // publish cleared the slot, re-creating it with pre-save text. Enqueueing on
  // the same lane is what orders them: the chain runs this only once that write's
  // response is back, so the backend has provably already seen it.
  const settleDraftWrites = useCallback(
    /** @param {string[]} blockPaths @param {string|null} [lane]  The language, when not the one on screen. */
    (blockPaths, lane) => {
      if (blockPaths.length === 0) return;
      const currentLocale = lane ?? draftLocaleRef.current;
      const state = blocksStore.get();
      const route = routeKey(draftSlugRef.current, currentLocale);
      const globals = globalsKey(currentLocale);
      /** @type {Set<string>} */
      const slugs = new Set();
      for (const blockPath of blockPaths) {
        // A block missing from the map still resolves to a slug rather than
        // being skipped: this exists to stop a write, and skipping one would
        // leave behind exactly the write it is here to stop.
        slugs.add(readBlock(state, route, globals, blockPath)?._slug ?? draftSlugRef.current);
      }

      const currentConfig = draftConfigRef.current;
      for (const slug of slugs) {
        draftQueue.cancel(contentDraftKey(slug, currentLocale));
        // Deliberately without `discardServerDrafts`' `draftValue != null`
        // filter: a publish leaves that null, so filtering would send nothing.
        draftQueue.enqueue(contentDraftKey(slug, currentLocale), async () => {
          try {
            const accessToken = (await stableGetAccessToken()) || undefined;
            await currentConfig.transport.deleteDraft(slug, {
              accessToken,
              locale: currentLocale ?? undefined,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] post-publish draft cleanup DELETE failed:", err);
          }
        });
      }
    },
    [stableGetAccessToken, blocksStore, draftQueue],
  );

  // Silent server-draft cleanup for discard. DELETEs each affected slug's
  // draft set without the debounce or `draftSyncStatus`, so the pill doesn't
  // flash a save for a request that removes a draft. DELETE over an echo-PUT
  // of the published value: an echo can lose a race with a concurrent
  // publish (the "old" value it sends is no longer the current published
  // one, so it recreates a draft instead of clearing it) — DELETE can't.
  // Per-slug chaining mirrors autosave so a mid-flight discard can't overtake
  // a pending PUT.
  const discardServerDrafts = useCallback(
    /** @param {string[]} blockPaths */
    (blockPaths) => {
      if (blockPaths.length === 0) return;
      /** @type {Map<string, string[]>} */
      const bySlug = new Map();
      const currentBlocks = readRouteBlocks();
      for (const blockPath of blockPaths) {
        const block = currentBlocks.get(blockPath);
        if (!block || block.draftValue == null) continue;
        const slug = block._slug ?? draftSlugRef.current;
        const list = bySlug.get(slug) ?? [];
        list.push(blockPath);
        bySlug.set(slug, list);
      }
      if (bySlug.size === 0) return;

      // Optimistic: null draftValue locally so dirtyCount and downstream
      // surfaces update without waiting for the round-trip.
      patchBlocks(
        [...bySlug.values()].flat(),
        (block) => (block.draftValue == null ? null : { ...block, draftValue: null }),
      );

      // Cleanup DELETEs go through the same per-slug lane as autosave, so one
      // can't overtake a PUT still in flight and leave the draft it just
      // removed re-created behind it.
      const currentConfig = draftConfigRef.current;
      const currentLocale = draftLocaleRef.current;
      for (const slug of bySlug.keys()) {
        draftQueue.enqueue(contentDraftKey(slug, currentLocale), async () => {
          try {
            const accessToken = (await stableGetAccessToken()) || undefined;
            await currentConfig.transport.deleteDraft(slug, {
              accessToken,
              locale: currentLocale ?? undefined,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] discard cleanup DELETE failed:", err);
          }
        });
      }
    },
    [stableGetAccessToken, readRouteBlocks, patchBlocks, draftQueue],
  );

  // Seams only: stores, setters, config, session. Nothing in here changes while
  // the app runs (the session fields settle once at sign-in), so a consumer
  // re-renders because a store slice it selected moved, never because the
  // context did.
  const value = useMemo(
    () => ({
      config: normalizedConfig,
      isAdmin,
      userSub,
      userInfo,
      onSignOut: onSignOut ? stableOnSignOut : browserSession ? browserSignOut : null,

      slugsStore,
      blocksStore,
      commitSite,
      commitSiteSlugs,
      setSiteStatus,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      settleDraftWrites,
      discardServerDrafts,
      translationDraftsStore,
      setTranslationDraft,
      clearTranslationDrafts,
      setIncludedLocales,

      uiStore,
      setBlockConflicts,
      clearBlockConflict,
      setActiveBlock,
      setPendingBlock,
      setActiveListItem,
      setDrawerOpen,
      triggerRefetch,

      registryStore,
      registerItemSchema,
      unregisterItemSchema,
      registerChoiceSource,
      unregisterChoiceSource,
      registerEditorVisibility,
      unregisterEditorVisibility,

      onAfterSave: stableOnAfterSave,
      onAfterCollectionSave: stableOnAfterCollectionSave,
      getAccessToken: stableGetAccessToken,
    }),
    [
      normalizedConfig,
      isAdmin,
      userSub,
      userInfo,
      onSignOut,
      stableOnSignOut,
      browserSession,
      browserSignOut,
      blocksStore,
      commitSite,
      commitSiteSlugs,
      setSiteStatus,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      settleDraftWrites,
      discardServerDrafts,
      translationDraftsStore,
      setTranslationDraft,
      clearTranslationDrafts,
      setIncludedLocales,
      uiStore,
      setBlockConflicts,
      clearBlockConflict,
      setActiveBlock,
      setPendingBlock,
      setActiveListItem,
      setDrawerOpen,
      triggerRefetch,
      registryStore,
      registerItemSchema,
      unregisterItemSchema,
      registerChoiceSource,
      unregisterChoiceSource,
      registerEditorVisibility,
      unregisterEditorVisibility,
      stableOnAfterSave,
      stableOnAfterCollectionSave,
      stableGetAccessToken,
    ],
  );

  const tree = (
    <>
      {/* The site the server handed over is the published one, and only a
          request with the editor's token carries their drafts and the versions
          a save needs. Mounted for everyone because a visitor's `refetch()` has
          to reach the backend too; for them it sits idle until they ask. */}
      <SiteLoader />
      <PageShell isAdmin={isAdmin}>{children}</PageShell>
      {/* A prop rather than context: the drawer is the only reader, and an
          inline array literal on the context value would wake every consumer
          on each host render. */}
      {isAdmin ? <AdminDrawer panels={normalizedPanels} /> : null}
      {sessionExpired && browserAuth ? (
        <Suspense fallback={null}>
          <SessionExpiredNotice
            onSignIn={() => browserAuth.login()}
            onDismiss={() => setSessionExpired(false)}
          />
        </Suspense>
      ) : null}
    </>
  );

  return (
    <CmsContext.Provider value={value}>
      {themeCss ? <style>{themeCss}</style> : null}
      {/* The editor and layout rules, gated on `isAdmin` because every surface
          they style is, so a visitor's page downloads neither the rules nor the
          editors they would style. */}
      {isAdmin ? <Suspense fallback={null}><AdminStyles /></Suspense> : null}
      {/* A prop rather than something the app nests itself, because it must
          wrap the drawer too, and the drawer is a sibling of `children`. It
          reads `config`/`isAdmin`/`getAccessToken`, so it sits inside here. */}
      {CollectionsRoot ? <CollectionsRoot>{tree}</CollectionsRoot> : tree}
    </CmsContext.Provider>
  );
}

/**
 * Moves the page out of the drawer's way while it is open. Its own component
 * subscribing to the store, rather than a value read in the provider: a panel
 * toggle then re-renders this wrapper alone, and `children` (a stable element)
 * is reused untouched.
 *
 * Which way it moves and by how much is `layoutCss`'s business; this only
 * reports whether the drawer is open.
 *
 * @param {{ isAdmin: boolean, children: React.ReactNode }} props
 */
function PageShell({ isAdmin, children }) {
  const { uiStore } = useCmsContext();
  const isDrawerOpen = useStoreSelector(uiStore, (s) => s.isDrawerOpen);
  return (
    <div
      className={isAdmin ? PAGE_SHELL_CLASS : undefined}
      data-drawer-open={isDrawerOpen ? "true" : undefined}
    >
      {children}
    </div>
  );
}

// Drop the auth marker params via history.replaceState (no Next.js navigation,
// so no re-render or scroll reset); other query params survive.
function stripAuthParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("cms-login");
  url.searchParams.delete("cms-auth");
  url.searchParams.delete("cms-logout");
  window.history.replaceState(null, "", url.toString());
}

// Where the editor's read lives. Renders nothing, and for a visitor does
// nothing at all until `refetch()` is called.
function SiteLoader() {
  useSiteBlocks();
  return null;
}
