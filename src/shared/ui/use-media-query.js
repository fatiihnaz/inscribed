"use client";

/**
 * @file `useMediaQuery`: a breakpoint the drawer can branch on in JS.
 *
 * `layout-css.js` deliberately keeps the shell's breakpoints in CSS, because
 * that file renders on the server and ships in the public bundle: a `matchMedia`
 * there would cost every visitor who never opens a drawer. This is the other
 * side of that line. It runs only inside the admin drawer, which is client-only
 * and already behind `next/dynamic`, and it exists for the one thing CSS cannot
 * express: which way a framer transition should travel.
 *
 * Anything CSS can answer on its own still belongs in a media query.
 */

import { useSyncExternalStore } from "react";

/**
 * @param {string} query  A media query string, e.g. `MOBILE_QUERY`.
 * @returns {boolean}     False during SSR and on the first server-rendered
 *                        paint, since there is no viewport to measure yet.
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => matches(query),
    // The server has no viewport. Answering false rather than guessing keeps
    // hydration from disagreeing with the markup it is matching against.
    () => false,
  );
}

/**
 * @param {string} query
 * @param {() => void} onChange
 */
function subscribe(query, onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(query);
  // `addEventListener` on a MediaQueryList is the modern spelling; Safari below
  // 14 only has `addListener`, and this ships to whatever browser the editor
  // happens to be on.
  if (list.addEventListener) {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }
  list.addListener(onChange);
  return () => list.removeListener(onChange);
}

/** @param {string} query */
function matches(query) {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}
