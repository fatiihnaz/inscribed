"use client";

/**
 * @file Body slot for the drawer's custom panel areas: the components an app
 * registered through `createCmsPage({ panels })`.
 *
 * Two things happen here that the drawer itself deliberately stays out of.
 *
 * A panel is mounted the first time it is opened and then stays mounted, hidden
 * while another area is on screen. Switching to the page tab and back must not
 * throw away a half-filled form, and `setBadge` has to keep working while the
 * panel is off screen, which it cannot do if the component is gone.
 *
 * And each panel gets its own `PanelContext` value rather than one shared one,
 * because `setBadge` names a rail icon: the panel has to be told which.
 */

import { memo, useCallback, useMemo, useRef } from "react";

import { PanelContext } from "../panels/context.js";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";

/**
 * @import { CmsPanel } from "../shared/panels.js"
 */

/**
 * Memoised, and every prop it takes is stable: the drawer subscribes to the
 * whole drafts map, so it re-renders on each keystroke in any block, and a
 * host's panel must not be dragged along for that.
 *
 * @param {{
 *   panels: readonly CmsPanel[],
 *   activeId: string | null,
 *   onBadge: (panelId: string, value: number | boolean | null) => void,
 *   onCrumbs: (panelId: string, trail: { label: string, onClick?: () => void }[] | null) => void,
 * }} props
 */
export const PanelArea = memo(function PanelArea({ panels, activeId, onBadge, onCrumbs }) {
  const { config, getAccessToken } = useCmsContext();
  const t = useCmsStrings();

  // The panel's way to the backend. The credential is attached here instead of
  // being handed over: a panel calling its own app's API needs nothing from us,
  // and one calling the CMS backend should go through the seam so a custom
  // transport still sees the traffic.
  const request = useCallback(
    /**
     * @param {string} path
     * @param {RequestInit & { accessToken?: string }} [init]
     */
    async (path, init) => {
      const send = config.transport.request;
      if (!send) {
        throw new Error(
          "[inscribed] useCmsPanel().request is unavailable: this transport implements no " +
            "`request` method. Add one to reach endpoints beside the CMS API, or have the " +
            "panel call its own app's routes directly.",
        );
      }
      assertBackendUrl(path, config.baseUrl);
      const accessToken = await getAccessToken();
      return send(path, { ...init, accessToken: accessToken || undefined });
    },
    [config, getAccessToken],
  );

  // Mutating a ref while rendering is safe here precisely because the write is
  // idempotent: adding the id React is already rendering for cannot change what
  // this render produces, so a double render in StrictMode agrees with itself.
  const mountedRef = useRef(/** @type {Set<string>} */ (new Set()));
  if (activeId) mountedRef.current.add(activeId);
  const mounted = mountedRef.current;

  return panels
    .filter((panel) => mounted.has(panel.id))
    .map((panel) => (
      <PanelSlot
        key={panel.id}
        panel={panel}
        active={panel.id === activeId}
        request={request}
        t={t}
        onBadge={onBadge}
        onCrumbs={onCrumbs}
      />
    ));
});

/**
 * @param {{
 *   panel: CmsPanel,
 *   active: boolean,
 *   request: (path: string, init?: RequestInit & { accessToken?: string }) => Promise<*>,
 *   t: import("../shared/i18n/translate.js").Translate,
 *   onBadge: (panelId: string, value: number | boolean | null) => void,
 *   onCrumbs: (panelId: string, trail: { label: string, onClick?: () => void }[] | null) => void,
 * }} props
 */
function PanelSlot({ panel, active, request, t, onBadge, onCrumbs }) {
  const setBadge = useCallback(
    /** @param {number | boolean | null} value */
    (value) => onBadge(panel.id, value),
    [onBadge, panel.id],
  );

  const setCrumbs = useCallback(
    /** @param {{ label: string, onClick?: () => void }[] | null} trail */
    (trail) => onCrumbs(panel.id, trail),
    [onCrumbs, panel.id],
  );

  // `active` is the one part of this that moves, which is the point: a panel
  // that polls needs to know it is off screen, and the only way to tell it is
  // to re-render it when that changes.
  const api = useMemo(
    () => ({ request, setBadge, setCrumbs, isActive: active, t }),
    [request, setBadge, setCrumbs, active, t],
  );

  const Component = panel.Component;
  return (
    // The scroll container is ours: the drawer owns this column's height, and a
    // panel that had to discover it would be reaching into our layout.
    <section style={active ? panelBodyStyle : hiddenStyle}>
      <PanelContext.Provider value={api}>
        <Component />
      </PanelContext.Provider>
    </section>
  );
}

// A flex column, not just a scroll box: a panel that hands its body to
// `<PanelStack>` needs a parent with a definite height for the stack's layers
// to fill. A panel that just returns markup still scrolls here as before.
const panelBodyStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  scrollbarWidth: "none",
});

const hiddenStyle = /** @type {React.CSSProperties} */ ({ display: "none" });

/**
 * `request` addresses the CMS backend and nothing else, which is what lets the
 * editor's credential ride on every call it makes with no rule about when.
 *
 * Refusing the alternative rather than stripping the credential for it: a
 * silently unauthenticated call comes back as a puzzling 401 from the panel's
 * own server, and a call routed to a third party through this seam gains
 * nothing anyway (no credential, no base URL). `fetch` reaches one directly,
 * and the absence of a CMS credential is then plain in the panel's own code
 * instead of being something to remember about ours.
 *
 * A relative path always qualifies: the transport resolves it against
 * `baseUrl`. An absolute one qualifies on the same origin, so writing the URL
 * out in full stays available.
 *
 * @param {string} path
 * @param {string} baseUrl
 */
function assertBackendUrl(path, baseUrl) {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(path)) return;
  try {
    if (new URL(path).origin === new URL(baseUrl).origin) return;
  } catch {
    // Not a URL we can compare; treated as somewhere else rather than guessed at.
  }
  throw new Error(
    `[inscribed] useCmsPanel().request cannot address "${path}". It reaches ${baseUrl} carrying ` +
      "the editor's credential, so it is not a general-purpose fetch: call another host with " +
      "fetch() instead, which sends no CMS credential.",
  );
}
