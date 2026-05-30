"use client";

/**
 * @file Tiny external store + selector hook (zero dependencies).
 *
 * Purpose: high-churn, per-key state (collection caches, live-edit draft
 * overlays) lives here instead of in React state on `CmsProvider`. React
 * context has no per-field subscription - any consumer of `useContext`
 * re-renders whenever the provided value's identity changes, so keeping
 * these maps in the context value re-rendered every `<CollectionItem>` /
 * `<CollectionRegion>` on the page on every keystroke.
 *
 * With a store, a write notifies subscribers directly (the provider never
 * re-renders), and each consumer reads a narrow slice through
 * `useStoreSelector`. `useSyncExternalStore` bails out of a re-render when
 * the selected slice is referentially unchanged, so typing in one row's
 * editor only re-renders the consumers that actually read that row.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * @template T
 * @typedef {Object} Store
 * @property {() => T} get
 * @property {(updater: T | ((prev: T) => T)) => void} set
 * @property {(listener: () => void) => () => void} subscribe
 */

/**
 * Create a minimal observable store. `set` accepts a value or an updater;
 * a write that returns the same reference (`===`) is a no-op and does not
 * notify - so callers can keep their "return prev when nothing changed"
 * pattern and avoid spurious re-renders.
 *
 * @template T
 * @param {T} initial
 * @returns {Store<T>}
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  return {
    get: () => state,
    set: (updater) => {
      const next =
        typeof updater === "function"
          ? /** @type {(prev: T) => T} */ (updater)(state)
          : updater;
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Subscribe to a slice of a store. Re-renders only when `selector`'s output
 * changes per `isEqual` (defaults to `Object.is`).
 *
 * IMPORTANT: `selector` must return a referentially-stable value when the
 * relevant slice hasn't changed - return a stored object/primitive, never a
 * freshly-constructed object/array, or pass an `isEqual` that treats the
 * constructed shapes as equal. A selector that always allocates would make
 * `getSnapshot` return a new reference every call and loop.
 *
 * @template T, S
 * @param {Store<T>} store
 * @param {(state: T) => S} selector
 * @param {(a: S, b: S) => boolean} [isEqual]
 * @returns {S}
 */
export function useStoreSelector(store, selector, isEqual) {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  // Memoise the last selected value so an unrelated write (which notifies
  // every subscriber) doesn't force a re-render here unless our slice
  // actually changed. `useSyncExternalStore` compares the snapshot by
  // `Object.is`; returning the cached reference is how we bail out.
  const memoRef = useRef(/** @type {{ value: S } | null} */ (null));

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.get());
    const memo = memoRef.current;
    if (memo) {
      const equal = isEqualRef.current
        ? isEqualRef.current(memo.value, next)
        : Object.is(memo.value, next);
      if (equal) return memo.value;
    }
    memoRef.current = { value: next };
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
