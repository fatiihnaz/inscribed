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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { CmsContext, useCmsContext } from "../shared/state/cms-context.js";
import { ensureCmsConfig } from "../shared/config.js";
import { normalizePanels } from "../shared/panels.js";
import { resolveCmsRoute } from "../shared/route.js";
import { fieldCss } from "../editors/field-css.js";
import { buildThemeCss } from "../shared/style/theme.js";
import { createRestTransport } from "../defaults/transport.js";
import { getBrowserAuth } from "../defaults/browser-auth.js";
import { indexBlocksByPath } from "./blocks.js";
import { deepEqual } from "../shared/util/deep-equal.js";
import { CmsApiError } from "../shared/contracts/errors.js";
import { createStore, useStoreSelector } from "../shared/state/store.js";
import { createDraftQueue } from "../shared/state/draft-queue.js";
import { contentDraftKey } from "../shared/state/draft-keys.js";
import { resolveBlockValue } from "./resolve.js";
import { useCmsContent } from "./hooks/use-cms-content.js";
import { useCmsStrings } from "./hooks/use-cms-strings.js";

/**
 * @import { CmsConfig } from "../shared/config.js"
 * @import { BlockResponse, ItemSchema } from "../shared/contracts/schemas.js"
 * @import { ChoiceSourceEntry } from "../shared/state/cms-context.js"
 */

const AdminDrawer = dynamic(
  () => import("../admin/Drawer.jsx").then((m) => m.Drawer),
  { ssr: false },
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
 * @param {BlockResponse[]} [props.initialBlocks]   Server-fetched blocks, seeded into the map before first paint to avoid SSR flicker.
 * @param {{ slug: string, locale: string|null }} [props.initialRoute]   What `initialBlocks` are *for*. Without it the client re-derives both from the pathname, which is wrong on a route whose slug was pinned (`<CmsPage slug="/news/[id]">`) and cannot tell a carried-over language from a current one. `createCmsPage` passes it.
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
  initialBlocks,
  initialRoute,
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
  const baseConfig = useMemo(() => ensureCmsConfig(config), [config]);
  // An inline `config={{ baseUrl }}` literal is a new object on every render of
  // the host, which re-normalizes here and hands the whole tree a new context
  // value each time, quietly undoing the seams-not-state design. Cheap to fix
  // (hoist it or use `createCmsConfig`), invisible without a warning.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (Object.isFrozen(config)) return;
    // eslint-disable-next-line no-console
    console.warn(
      "[inscribed] <CmsProvider config={...}> received an unfrozen object. Build it once with createCmsConfig() at module scope; an inline literal re-renders every consumer on each parent render.",
    );
  }, [config]);
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
  const router = useRouter();
  // The URL slug: what a link points at, derived from the pathname. Not
  // necessarily what the backend stores under, which is `contentRoute` below.
  const { slug: routeSlug, locale } = resolveCmsRoute(pathname, normalizedConfig);
  // Only read while the blocks store is created, so it is the mount-time route.
  const initialPathname = pathname;

  // Keyed by pathname, then by blockPath. Pathname rather than slug because two
  // locales share one slug and each renders its own route. A return visit is
  // instant off this map, with no effect in between to leave a frame of
  // placeholders. Seeded from `initialBlocks` so regions render real values
  // during SSR and first paint.
  const blocksStore = useConstant(() =>
    createStore(
      /** @type {Map<string, Map<string, BlockResponse>>} */ (
        new Map([[initialPathname, indexBlocksByPath(initialBlocks ?? [])]])
      ),
    ),
  );
  const contentDraftsStore = useConstant(() =>
    createStore(/** @type {Map<string, *>} */ (new Map())),
  );
  // Edits staged for a block in a language the editor is not currently reading,
  // keyed by `translationDraftKey`. A separate map from `contentDraftsStore`
  // because everything subscribed to that one assumes a bare blockPath on the
  // current route: the autosave collector would try to PUT these into the
  // wrong locale's draft slot.
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
      refetchToken: 0,
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

  // Replace one route's blocks wholesale; what `useCmsContent` calls once a
  // fetch lands. Other routes' entries stay, which is the cache.
  const commitBlocks = useCallback(
    /** @param {string} pathname @param {Map<string, BlockResponse>} blocks */
    (pathname, blocks) => {
      blocksStore.set((s) => {
        const next = new Map(s);
        next.set(pathname, blocks);
        return next;
      });
    },
    [blocksStore],
  );

  // Patch one route's blocks in place, for the autosave mirror and discard.
  // An updater returning its input is a no-op, as with the plain store.
  const patchBlocks = useCallback(
    /**
     * @param {string} pathname
     * @param {(prev: Map<string, BlockResponse>) => Map<string, BlockResponse>} updater
     */
    (pathname, updater) => {
      blocksStore.set((s) => {
        const prev = s.get(pathname);
        if (!prev) return s;
        const blocks = updater(prev);
        if (blocks === prev) return s;
        const next = new Map(s);
        next.set(pathname, blocks);
        return next;
      });
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

  /**
   * Switching language lands on a route the store has never held, and a
   * root-layout `<CmsPage>` does not re-render with fresh server blocks for it,
   * so the client refetch is the only thing coming. In the meantime every
   * surface reading this route saw an empty map: the page fell back to default
   * values and the drawer's whole block list, collection reference rows
   * included, unmounted and came back a moment later.
   *
   * The two routes are one page in two languages. The manifest is
   * locale-agnostic, so they carry the same paths, types and order, and the
   * only thing that differs is the text. Carrying the previous route's blocks
   * over keeps every one of those surfaces mounted, and the refetch replaces
   * the words behind it.
   *
   * `draftValue` is dropped on the way: those belong to the language they were
   * typed in, and left on they would count as this language's unpublished
   * changes and offer themselves to the next publish.
   *
   * @param {string} from
   * @param {string} to
   */
  const carryLocaleSwitch = useCallback((from, to) => {
    if (blocksStore.get().has(to)) return;
    const before = resolveCmsRoute(from, normalizedConfig);
    const after = resolveCmsRoute(to, normalizedConfig);
    if (before.slug !== after.slug || before.locale === after.locale) return;
    const carried = blocksStore.get().get(from);
    if (!carried) return;
    provisionalRef.current.add(to);
    /** @type {Map<string, BlockResponse>} */
    const next = new Map();
    for (const [path, block] of carried) {
      next.set(path, block.draftValue == null ? block : { ...block, draftValue: null });
    }
    commitBlocks(to, next);
  }, [blocksStore, commitBlocks, normalizedConfig]);

  // Re-seed the blocks map when `initialBlocks` arrives with new content (e.g.
  // navigation re-renders `<CmsPage>` for a new slug). Lazy init only runs once
  // on mount, so without this the panel would show stale blocks.
  // One effect for both triggers, because the refetch decision below needs to
  // see them together: whether fresh server blocks arrived *with* this
  // navigation is exactly what says if another fetch is needed.
  // What the blocks now in the store were fetched for, and for which pathname.
  // The client cannot re-derive `slug`: on `<CmsPage slug="/news/[id]">` the
  // pathname is `/news/1`, a slug the backend never saw. State, not a ref,
  // because `useCmsContent` addresses its fetch with it.
  const [contentRoute, setContentRoute] = useState(() => ({
    pathname: initialPathname,
    slug: initialRoute?.slug ?? routeSlug,
    locale: initialRoute?.locale ?? locale,
  }));
  // Entries `carryLocaleSwitch` wrote: the previous language's blocks, standing
  // in until the real ones arrive. Present in the store but not an answer, so
  // nothing may read their presence as "this route is already served".
  const provisionalRef = useRef(/** @type {Set<string>} */ (new Set()));

  const initialBlocksRef = useRef(initialBlocks);
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    const blocksChanged = initialBlocks !== initialBlocksRef.current;
    const pathChanged = pathname !== lastPathnameRef.current;
    if (!blocksChanged && !pathChanged) return;
    const previousPathname = lastPathnameRef.current;
    initialBlocksRef.current = initialBlocks;
    lastPathnameRef.current = pathname;

    // New server content lands under the route it describes, and settles what
    // that route's blocks are for.
    if (blocksChanged) {
      commitBlocks(pathname, indexBlocksByPath(initialBlocks ?? []));
      provisionalRef.current.delete(pathname);
      setContentRoute({
        pathname,
        slug: initialRoute?.slug ?? routeSlug,
        locale: initialRoute?.locale ?? locale,
      });
    } else if (pathChanged) {
      carryLocaleSwitch(previousPathname, pathname);
    }
    // Conflicts go with the drafts they were raised against. `pendingBlock` is
    // deliberately left alone: it names a block on the route being navigated
    // *to*, so clearing it here would cancel the very jump this navigation is.
    patchUi({ activeBlock: null, conflictBlocks: new Set() });
    setDraftsState(new Map());
    // Staged translations go with the page they were typed against, same as
    // the drafts above: they are only publishable from the route that offered
    // them, so surviving a navigation would leave an edit nothing can reach.
    setTranslationDraftsState(new Map());

    // A navigation needs at most one refetch. A route already answered renders
    // from the store immediately and needs no nudge; a provisional entry only
    // looks answered, and skipping the nudge on one is how a locale switch used
    // to leave a public visitor reading the previous language all session.
    if (!pathChanged || blocksChanged) return;
    if (blocksStore.get().has(pathname) && !provisionalRef.current.has(pathname)) return;
    // An editor's client refetch fills this, and `router.refresh()` could not
    // help them anyway: the SSR response is ISR-cached under one tag for every
    // visitor, so it structurally cannot carry their `draftValue`.
    //
    // Navigating off the route the server described drops `contentSlug`, and
    // the fetch falls back to deriving one. That is safe here and only here: a
    // slug can only be pinned per page (`<CmsPage slug="/news/[id]">`), and a
    // page that pins one re-renders on the way in, so fresh blocks arrive with
    // it and this branch is never reached. A root-layout `<CmsPage>` pins
    // nothing, so the server derives the same slug the client would.
    if (isAdmin) return;
    router.refresh();
    // `contentRoute`, `initialRoute`, `routeSlug` and `locale` are read as the
    // values current with this navigation, never as triggers: the effect must
    // fire on a route or content change and nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBlocks, pathname, isAdmin, router, blocksStore, commitBlocks, carryLocaleSwitch, setDraftsState, setTranslationDraftsState, patchUi]);

  // Drop drafts for blocks that no longer exist (e.g. after a manifest sync
  // removed one). Subscribed rather than keyed on a render value, since blocks
  // now change without re-rendering the provider. Pathname-change drafts are
  // already cleared above.
  const prunePathnameRef = useRef(pathname);
  prunePathnameRef.current = pathname;
  useEffect(() => {
    const prune = () => {
      // Only the route being edited: drafts belong to the page they were typed
      // on, and navigation already clears them.
      const currentBlocks = blocksStore.get().get(prunePathnameRef.current);
      if (!currentBlocks) return;
      setDraftsState((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Map();
        for (const [path, value] of prev) {
          if (currentBlocks.has(path)) next.set(path, value);
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
  // PUT each. Block/version/config/pathname are read through refs so unrelated
  // re-renders don't reset the timer, only a real `drafts` mutation does.

  const setDraftSyncStatus = useCallback(
    /** @param {"idle"|"saving"|"saved"|"failed"} status */
    (status) => patchUi({ draftSyncStatus: status }),
    [patchUi],
  );

  const draftPathnameRef = useRef(pathname);
  draftPathnameRef.current = pathname;
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
     * @param {string} pathname       Cache key for this route's blocks.
     * @param {string} fallbackSlug   Slug for blocks that carry no `_slug` stamp.
     */
    const pruneSettledDrafts = (slug, pathname, fallbackSlug) => {
      const blocks = blocksStore.get().get(pathname) ?? EMPTY_BLOCKS;
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

      const pathname = draftPathnameRef.current ?? "/";
      const blocks = blocksStore.get().get(pathname) ?? EMPTY_BLOCKS;
      /** @type {Set<string>} */
      const slugs = new Set();
      for (const blockPath of drafts.keys()) {
        const block = blocks.get(blockPath);
        if (block) slugs.add(block._slug ?? draftSlugRef.current);
      }

      for (const slug of slugs) {
        draftQueue.schedule(contentDraftKey(slug, draftLocaleRef.current), async (ctx) => {
          const currentPathname = draftPathnameRef.current ?? "/";
          const currentSlug = draftSlugRef.current;
          const currentLocale = draftLocaleRef.current;
          const currentBlocks = blocksStore.get().get(currentPathname) ?? EMPTY_BLOCKS;
          const items = collectForSlug(slug, currentSlug, currentBlocks);
          if (items.length === 0) {
            pruneSettledDrafts(slug, currentPathname, currentSlug);
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
          patchBlocks(currentPathname, (prev) => {
            let mutated = false;
            const nextMap = new Map(prev);
            for (const sent of items) {
              const cur = nextMap.get(sent.blockPath);
              if (!cur) continue;
              const newDraftValue = deepEqual(sent.value, cur.value) ? null : sent.value;
              if (deepEqual(cur.draftValue ?? null, newDraftValue)) continue;
              nextMap.set(sent.blockPath, { ...cur, draftValue: newDraftValue });
              mutated = true;
            }
            return mutated ? nextMap : prev;
          });
          pruneSettledDrafts(slug, currentPathname, currentSlug);

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
    contentDraftsStore, blocksStore, patchBlocks, draftQueue, setDraftsState,
    stableGetAccessToken, flashDraftStatus, setDraftSyncStatus, triggerRefetch,
  ]);

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
    /** @param {string[]} blockPaths */
    (blockPaths) => {
      if (blockPaths.length === 0) return;
      const currentPathname = draftPathnameRef.current ?? "/";
      const currentBlocks = blocksStore.get().get(currentPathname) ?? EMPTY_BLOCKS;
      /** @type {Set<string>} */
      const slugs = new Set();
      for (const blockPath of blockPaths) {
        // A block missing from the map still resolves to a slug rather than
        // being skipped: this exists to stop a write, and skipping one would
        // leave behind exactly the write it is here to stop.
        slugs.add(currentBlocks.get(blockPath)?._slug ?? draftSlugRef.current);
      }

      const currentConfig = draftConfigRef.current;
      const currentLocale = draftLocaleRef.current;
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
      const currentPathname = draftPathnameRef.current ?? "/";
      const currentBlocks = blocksStore.get().get(currentPathname) ?? new Map();
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
      patchBlocks(currentPathname, (prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const pathsForSlug of bySlug.values()) {
          for (const blockPath of pathsForSlug) {
            const cur = next.get(blockPath);
            if (!cur || cur.draftValue == null) continue;
            next.set(blockPath, { ...cur, draftValue: null });
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });

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
    [stableGetAccessToken, blocksStore, patchBlocks, draftQueue],
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
      // The slug the backend stores this route under, when the server told us.
      // Null once we have navigated away from the route it described, and a
      // null here means "ask, don't derive".
      contentSlug: contentRoute.pathname === pathname ? contentRoute.slug : null,
      onSignOut: onSignOut ? stableOnSignOut : browserSession ? browserSignOut : null,

      blocksStore,
      commitBlocks,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      settleDraftWrites,
      discardServerDrafts,
      translationDraftsStore,
      setTranslationDraft,
      clearTranslationDrafts,

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
      contentRoute,
      pathname,
      onSignOut,
      stableOnSignOut,
      browserSession,
      browserSignOut,
      blocksStore,
      commitBlocks,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      settleDraftWrites,
      discardServerDrafts,
      translationDraftsStore,
      setTranslationDraft,
      clearTranslationDrafts,
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
      {/* Admin-only client refetch so post-save `triggerRefetch` and the
          autosave roundtrip pull fresh versions in without a navigation.
          Public visitors refresh via `router.refresh()` above instead. */}
      {isAdmin ? <ContentLoader /> : null}
      <PageShell isAdmin={isAdmin}>{children}</PageShell>
      {/* A prop rather than context: the drawer is the only reader, and an
          inline array literal on the context value would wake every consumer
          on each host render. */}
      {isAdmin ? <AdminDrawer panels={normalizedPanels} /> : null}
      {sessionExpired && browserAuth ? (
        <SessionExpiredNotice
          onSignIn={() => browserAuth.login()}
          onDismiss={() => setSessionExpired(false)}
        />
      ) : null}
    </>
  );

  return (
    <CmsContext.Provider value={value}>
      {themeCss ? <style>{themeCss}</style> : null}
      {/* Above every surface that renders a field: the drawer, the page-side
          inline editors, and a standalone composer on a host page. Gated on
          `isAdmin` because all three are, so a visitor's page carries neither
          the rules nor the editors they would style. */}
      {isAdmin ? <style>{fieldCss}</style> : null}
      {/* A prop rather than something the app nests itself, because it must
          wrap the drawer too, and the drawer is a sibling of `children`. It
          reads `config`/`isAdmin`/`getAccessToken`, so it sits inside here. */}
      {CollectionsRoot ? <CollectionsRoot>{tree}</CollectionsRoot> : tree}
    </CmsContext.Provider>
  );
}

/**
 * Pushes the page right while the drawer is open, so the panel doesn't overlap
 * content. Its own component subscribing to the store, rather than a value read
 * in the provider: a panel toggle then re-renders this wrapper alone, and
 * `children` (a stable element) is reused untouched. The plain CSS transition
 * keeps `framer-motion` in the lazy admin chunk, off the public bundle.
 *
 * @param {{ isAdmin: boolean, children: React.ReactNode }} props
 */
function PageShell({ isAdmin, children }) {
  const { uiStore } = useCmsContext();
  const isDrawerOpen = useStoreSelector(uiStore, (s) => s.isDrawerOpen);
  return (
    <div
      style={{
        marginLeft: isAdmin && isDrawerOpen ? ADMIN_PANEL_WIDTH : 0,
        transition: "margin-left 350ms cubic-bezier(0.32, 0.72, 0.18, 1)",
      }}
    >
      {children}
    </div>
  );
}

// Must match PANEL_WIDTH in shared/style/tokens.js. Hardcoded, not imported,
// so the token module stays out of the public bundle (the drawer that uses it
// is admin-only and lazy-loaded).
const ADMIN_PANEL_WIDTH = 460;

// Drop the auth marker params via history.replaceState (no Next.js navigation,
// so no re-render or scroll reset); other query params survive.
function stripAuthParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("cms-login");
  url.searchParams.delete("cms-auth");
  url.searchParams.delete("cms-logout");
  window.history.replaceState(null, "", url.toString());
}

// Inline (not in the lazy admin chunk): it must render after the drawer has
// already unmounted, and its only trigger is an expired admin session.
function SessionExpiredNotice({ onSignIn, onDismiss }) {
  const t = useCmsStrings();
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "var(--ins-bg, #1c1815)",
        color: "var(--ins-text, #fff)",
        borderRadius: "var(--ins-radius, 10px)",
        fontFamily: "var(--ins-font-sans, system-ui, sans-serif)",
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      }}
    >
      <span>{t("core.session.expired")}</span>
      <button
        type="button"
        onClick={onSignIn}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "none",
          background: "var(--ins-accent, #c9b896)",
          color: "#1c1815",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("core.session.signIn")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("translations.dismiss")}
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          opacity: 0.6,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}

// Admin-only. Public visitors render from `initialBlocks` (ISR-cached, dropped
// on save via `revalidateCmsSlug`), so they never need this client refetch.
function ContentLoader() {
  useCmsContent();
  return null;
}
