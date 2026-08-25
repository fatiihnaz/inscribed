"use client";

/**
 * @file Links into the admin surface: a URL that opens the drawer on a
 * particular thing, so an editor can be sent to it the way a page is.
 *
 * One marker per link, because a link opens one thing:
 *
 *   ?cms-block=hero.title        the block's card, on the page in the URL
 *   ?cms-record=news/congress    that record, in the collections area
 *   ?cms-collection=news         the collection itself
 *   ?cms-panel=orders            a custom panel
 *
 * They survive a sign-in, which is what makes them shareable at all: the login
 * round trip only rewrites its own markers (`buildLoginUrl` in
 * `defaults/browser-auth.js`), so `?cms-login&cms-block=hero.title` sent to
 * someone signed out still lands them on the block.
 *
 * Parsing is kept here, away from React, because it is the part with rules.
 */

/**
 * @typedef {{ kind: "block", blockPath: string }
 *         | { kind: "record", collectionKey: string, slug: string }
 *         | { kind: "collection", collectionKey: string }
 *         | { kind: "panel", panelId: string }} CmsOpenTarget
 */

/**
 * Read in this order, and only the first one present is acted on: a link that
 * carries two is a mistake, not a request to open two areas at once.
 */
const PARAMS = /** @type {const} */ ([
  "cms-block", "cms-record", "cms-collection", "cms-panel",
]);

/**
 * @param {string} search  `window.location.search`.
 * @returns {{ target: CmsOpenTarget | null, warning: string | null }}
 *   A warning rather than a throw: a malformed marker is somebody's typo in a
 *   URL, and refusing to render the drawer over it would be a poor trade.
 */
export function readOpenTarget(search) {
  const params = new URLSearchParams(search);
  const present = PARAMS.filter((name) => params.get(name));
  if (present.length === 0) return { target: null, warning: null };

  const name = present[0];
  const value = /** @type {string} */ (params.get(name));
  const extra = present.length > 1
    ? ` (ignoring ${present.slice(1).join(", ")}: a link opens one thing)`
    : "";

  switch (name) {
    case "cms-block":
      return { target: { kind: "block", blockPath: value }, warning: extra ? warn(extra) : null };
    case "cms-record": {
      // `key/slug`, which reads like the record's own address. Split at the
      // first slash only: a slug may carry more of them, a collection key may not.
      const cut = value.indexOf("/");
      if (cut <= 0 || cut === value.length - 1) {
        return {
          target: null,
          warning: warn(`?cms-record=${value} is not a "collection/slug" pair; use ?cms-collection= for a whole collection.`),
        };
      }
      return {
        target: { kind: "record", collectionKey: value.slice(0, cut), slug: value.slice(cut + 1) },
        warning: extra ? warn(extra) : null,
      };
    }
    case "cms-collection":
      return { target: { kind: "collection", collectionKey: value }, warning: extra ? warn(extra) : null };
    default:
      return { target: { kind: "panel", panelId: value }, warning: extra ? warn(extra) : null };
  }
}

/** @param {string} text */
function warn(text) {
  return `[inscribed] ${text.trim()}`;
}

/**
 * Take the markers back out of the address bar once they have been acted on.
 * `replaceState` rather than a router call: this is not a navigation, and a
 * re-render (or a scroll reset) is not what a consumed marker should cost.
 *
 * Runs even when the target was ignored, since a marker left in place would
 * re-fire on every later mount, long after the link that carried it.
 */
export function stripOpenParams() {
  const url = new URL(window.location.href);
  for (const name of PARAMS) url.searchParams.delete(name);
  window.history.replaceState(null, "", url.toString());
}
