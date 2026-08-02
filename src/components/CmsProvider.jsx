"use client";

/**
 * @file Top-level provider owning CMS state. Mount once near the root. Holds
 * the blocks map, active-block selection, draft autosave, and the refetch
 * token. The admin drawer is lazy-loaded so public visitors don't pay for it.
 *
 * All of that state lives in stores (see `lib/store.js`), not React state, and
 * the context carries only the handles and setters. A write therefore reaches
 * the components that selected the changed slice and nobody else: a keystroke
 * touches one region, a panel toggle touches the panel, an autosave roundtrip
 * touches the block it saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { CmsContext, useCmsContext } from "../lib/context.js";
import { ensureCmsConfig } from "../lib/config.js";
import { buildThemeCss } from "../lib/theme.js";
import { createRestTransport } from "../defaults/transport.js";
import { getBrowserAuth } from "../defaults/browser-auth.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { deepEqual } from "../lib/deep-equal.js";
import { createStore, useStoreSelector } from "../lib/store.js";
import { createDraftQueue } from "../lib/draft-queue.js";
import { contentDraftKey } from "../lib/draft-keys.js";
import { resolveBlockValue } from "../lib/resolve.js";
import { useCmsContent } from "../hooks/use-cms-content.js";
import { CollectionProvider } from "./CollectionProvider.jsx";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse, ItemSchema } from "../lib/schemas.js"
 */

const AdminDrawer = dynamic(
  () => import("./AdminDrawer.jsx").then((m) => m.AdminDrawer),
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
 * @param {(slug: string) => void | Promise<void>} [props.onAfterSave]   Server Action run after a save, typically `revalidateTag(cmsCacheTag(slug))`.
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the user's JWT, added as `Authorization: Bearer` on writes. When omitted and `config.clientKey` is set, the built-in browser auth (reference backend `/auth/*`) takes over; omit both for public mode.
 * @param {import("../lib/transport.js").CmsTransport} [props.transport]   Custom client transport. Defaults to REST from `config`. Passed here, not via `config`, because it holds functions that can't cross the RSC boundary.
 * @param {{ name: string|null, email: string|null, image: string|null } | null} [props.userInfo]   Identity for the admin panel footer. Null in public mode.
 * @param {(key: string, slug?: string) => void | Promise<void>} [props.onAfterCollectionSave]   Server Action run after a collection record is published, typically `revalidateCmsCollection` from `inscribed/actions`.
 * @param {() => void} [props.onSignOut]   Invoked by the admin panel's logout button.
 * @param {React.ReactNode} props.children
 */
export function CmsProvider({
  config,
  userSub: userSubProp = null,
  isAdmin: isAdminProp = false,
  initialBlocks,
  onAfterSave,
  onAfterCollectionSave,
  getAccessToken,
  transport,
  userInfo: userInfoProp = null,
  onSignOut,
  children,
}) {
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
  // Only read while the blocks store is created, so it is the mount-time route.
  const initialPathname = pathname;

  // Keyed by slug, then by blockPath. The slug dimension is what makes a return
  // visit instant: a region reads `get(slug).get(path)`, so the moment the route
  // commits it already sees the blocks it fetched last time, with no effect in
  // between to leave a frame of placeholders. Seeded from `initialBlocks` so
  // regions render real values during SSR and first paint.
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
  const uiStore = useConstant(() =>
    createStore(/** @type {import("../lib/context.js").CmsUiState} */ ({
      activeBlock: null,
      activeListItem: null,
      isDrawerOpen: false,
      draftSyncStatus: "idle",
      refetchToken: 0,
    })),
  );
  // One lane per slug for block-draft writes. Pinned for the same reason the
  // stores are: a queue React could drop would strand in-flight requests.
  const draftQueue = useConstant(() => createDraftQueue());
  useEffect(() => () => draftQueue.dispose(), [draftQueue]);

  const registryStore = useConstant(() =>
    createStore(/** @type {import("../lib/context.js").CmsRegistryState} */ ({
      itemSchemas: new Map(),
      editorVisibility: new Map(),
    })),
  );

  const setDraftsState = contentDraftsStore.set;

  // Replace one slug's blocks wholesale; what `useCmsContent` calls once a
  // fetch lands. Other slugs' entries stay, which is the cache.
  const commitBlocks = useCallback(
    /** @param {string} slug @param {Map<string, BlockResponse>} blocks */
    (slug, blocks) => {
      blocksStore.set((s) => {
        const next = new Map(s);
        next.set(slug, blocks);
        return next;
      });
    },
    [blocksStore],
  );

  // Patch the blocks of one slug in place, for the autosave mirror and discard.
  // An updater returning its input is a no-op, as with the plain store.
  const patchBlocks = useCallback(
    /**
     * @param {string} slug
     * @param {(prev: Map<string, BlockResponse>) => Map<string, BlockResponse>} updater
     */
    (slug, updater) => {
      blocksStore.set((s) => {
        const prev = s.get(slug);
        if (!prev) return s;
        const blocks = updater(prev);
        if (blocks === prev) return s;
        const next = new Map(s);
        next.set(slug, blocks);
        return next;
      });
    },
    [blocksStore],
  );

  /** @param {Partial<import("../lib/context.js").CmsUiState>} patch */
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

  // Re-seed the blocks map when `initialBlocks` arrives with new content (e.g.
  // navigation re-renders `<CmsPage>` for a new slug). Lazy init only runs once
  // on mount, so without this the panel would show stale blocks.
  // One effect for both triggers, because the refetch decision below needs to
  // see them together: whether fresh server blocks arrived *with* this
  // navigation is exactly what says if another fetch is needed.
  const initialBlocksRef = useRef(initialBlocks);
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    const blocksChanged = initialBlocks !== initialBlocksRef.current;
    const pathChanged = pathname !== lastPathnameRef.current;
    if (!blocksChanged && !pathChanged) return;
    initialBlocksRef.current = initialBlocks;
    lastPathnameRef.current = pathname;

    // New server content lands under the route it describes.
    if (blocksChanged) commitBlocks(pathname, indexBlocksByPath(initialBlocks ?? []));
    patchUi({ activeBlock: null });
    setDraftsState(new Map());

    // A navigation needs at most one refetch, and only when there is nothing to
    // show. A slug already in the store renders from it immediately and
    // `<ContentLoader>` revalidates behind that, so no nudge is warranted.
    if (!pathChanged || blocksChanged) return;
    if (blocksStore.get().has(pathname)) return;
    // Nothing cached for this route. An editor's client refetch will fill it,
    // and `router.refresh()` could not help them anyway: the SSR fetch carries
    // a service token and its response is ISR-cached under one tag for every
    // visitor, so it structurally cannot carry an admin's `draftValue`. Public
    // visitors run no client fetch at all, so for them the server is the only
    // path, and a root-layout `<CmsPage>` (whose props survive a route change)
    // is what actually needs the nudge.
    if (isAdmin) return;
    router.refresh();
  }, [initialBlocks, pathname, isAdmin, router, blocksStore, commitBlocks, setDraftsState, patchUi]);

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
  }, [setDraftsState, draftQueue]);

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
    /** @param {string} slug */
    async (slug) => {
      const fn = onAfterSaveRef.current;
      if (!fn) return;
      await fn(slug);
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
     * @param {string} pathname
     * @param {Map<string, import("../lib/schemas.js").BlockResponse>} blocks
     */
    const collectForSlug = (slug, pathname, blocks) => {
      /** @type {import("../lib/schemas.js").UpdateBlockItem[]} */
      const items = [];
      for (const [blockPath, value] of contentDraftsStore.get()) {
        const block = blocks.get(blockPath);
        if (!block) continue;
        if ((block._slug ?? pathname) !== slug) continue;
        if (deepEqual(value, resolveBlockValue(block))) continue;
        items.push({ blockPath, value, version: block.version });
      }
      return items;
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
        if (block) slugs.add(block._slug ?? pathname);
      }

      for (const slug of slugs) {
        draftQueue.schedule(contentDraftKey(slug), async (ctx) => {
          const currentPathname = draftPathnameRef.current ?? "/";
          const currentBlocks = blocksStore.get().get(currentPathname) ?? EMPTY_BLOCKS;
          const items = collectForSlug(slug, currentPathname, currentBlocks);
          if (items.length === 0) return;

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
              { accessToken },
            );
          } catch (err) {
            if (ctx.isStale()) return;
            // eslint-disable-next-line no-console
            console.warn("[inscribed] draft autosave failed:", err);
            if (!isAllReset) flashDraftStatus("failed");
            return;
          }

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

          if (isAllReset) setDraftSyncStatus("idle");
          else flashDraftStatus("saved");
        });
      }
    };

    return contentDraftsStore.subscribe(arm);
  }, [
    contentDraftsStore, blocksStore, patchBlocks, draftQueue,
    stableGetAccessToken, flashDraftStatus, setDraftSyncStatus,
  ]);

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
        const slug = block._slug ?? currentPathname;
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
      for (const slug of bySlug.keys()) {
        draftQueue.enqueue(contentDraftKey(slug), async () => {
          try {
            const accessToken = (await stableGetAccessToken()) || undefined;
            await currentConfig.transport.deleteDraft(slug, { accessToken });
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
      onSignOut: onSignOut ? stableOnSignOut : browserSession ? browserSignOut : null,

      blocksStore,
      commitBlocks,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,

      uiStore,
      setActiveBlock,
      setActiveListItem,
      setDrawerOpen,
      triggerRefetch,

      registryStore,
      registerItemSchema,
      unregisterItemSchema,
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
      commitBlocks,
      contentDraftsStore,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,
      uiStore,
      setActiveBlock,
      setActiveListItem,
      setDrawerOpen,
      triggerRefetch,
      registryStore,
      registerItemSchema,
      unregisterItemSchema,
      registerEditorVisibility,
      unregisterEditorVisibility,
      stableOnAfterSave,
      stableOnAfterCollectionSave,
      stableGetAccessToken,
    ],
  );

  return (
    <CmsContext.Provider value={value}>
      {themeCss ? <style>{themeCss}</style> : null}
      {/* Collections are opt-in (see `inscribed/collections`), mounted here so
          page bindings and the drawer's collection tabs share one
          `CollectionContext`. It reads `config`/`isAdmin`/`getAccessToken` from
          `CmsContext`, so it must live inside this provider. */}
      <CollectionProvider>
        {/* Admin-only client refetch so post-save `triggerRefetch` and the
            autosave roundtrip pull fresh versions in without a navigation.
            Public visitors refresh via `router.refresh()` above instead. */}
        {isAdmin ? <ContentLoader /> : null}
        <PageShell isAdmin={isAdmin}>{children}</PageShell>
        {isAdmin ? <AdminDrawer /> : null}
        {sessionExpired && browserAuth ? (
          <SessionExpiredNotice
            onSignIn={() => browserAuth.login()}
            onDismiss={() => setSessionExpired(false)}
          />
        ) : null}
      </CollectionProvider>
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

// Must match PANEL_WIDTH in AdminDrawer.jsx. Hardcoded, not imported, so it
// stays out of the public bundle (AdminDrawer is admin-only and lazy-loaded).
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
      <span>Oturumun sona erdi. Düzenlemeye devam etmek için tekrar giriş yap.</span>
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
        Giriş yap
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Kapat"
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
