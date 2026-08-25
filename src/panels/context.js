"use client";

/**
 * @file The API a custom admin panel reads about itself, held in its own React
 * context so a panel's nested markup reaches it without prop drilling.
 *
 * Provided per panel by `admin/PanelArea.jsx`, consumed via `useCmsPanel()`
 * (`inscribed/panels`). Scoped to one panel rather than the whole drawer
 * because `setBadge` has to know which rail icon it is marking.
 */

import { createContext, useContext } from "react";

/**
 * @typedef {Object} CmsPanelApi
 * @property {(path: string, init?: RequestInit & { accessToken?: string }) => Promise<*>} request
 *   Authenticated call to the CMS backend through the configured transport,
 *   resolved against `config.baseUrl` with no `/cms` prefix. The editor's
 *   credential is attached here rather than handed out, and this addresses that
 *   backend only: another host is refused, since `fetch` reaches one directly
 *   and a CMS credential has no business travelling there.
 * @property {(value: number | boolean | null) => void} setBadge
 *   Mark this panel's rail icon: a count, a plain dot, or `null` to clear.
 *   Deliberately unrelated to the drawer's Save: that flow publishes versioned
 *   content blocks and cannot speak for a panel's own pending work.
 * @property {boolean} isActive
 *   Whether this panel is the area on screen. A panel is mounted the first time
 *   it is opened and then kept, hidden, so that a half-filled form survives a
 *   trip to another area and a badge keeps updating. The cost is that a panel
 *   which polls would otherwise keep going while nobody is looking: read this
 *   to stand that work down, or to refresh on the way back in.
 * @property {(trail: { label: string, onClick?: () => void }[] | null) => void} setCrumbs
 *   Report where inside the panel the user currently is; the drawer's header
 *   path becomes this trail. The panel's own name is part of it, so the trail's
 *   first entry can carry the "back to the root view" handler, which only the
 *   panel knows. `null` restores the panel's plain name.
 *
 *   `<PanelStack>` calls this for you and is the usual way in; reach for it
 *   directly only when drawing your own transitions.
 * @property {import("../shared/i18n/translate.js").Translate} t
 *   The drawer's translator, fed by `adminLocale` / `adminStrings`. Panels with
 *   one language can ignore it and write their text inline.
 */

/** @type {React.Context<CmsPanelApi | null>} */
export const PanelContext = createContext(/** @type {CmsPanelApi | null} */ (null));

/**
 * Read the enclosing panel's API. Throws outside a panel body, which is the
 * only place it means anything.
 *
 * @returns {CmsPanelApi}
 */
export function useCmsPanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error(
      "useCmsPanel() must be called inside a panel's own component tree. " +
        "Panels are registered with createCmsPage({ panels: [{ id, label, Component }] }) " +
        "(or <CmsProvider panels={…}>), and only the `Component` they name renders inside one.",
    );
  }
  return ctx;
}
