"use client";

/**
 * @file Tiny external store + selector hook, zero dependencies. Holds
 * high-churn per-key state (collection caches, draft overlays) outside React
 * state so a write notifies only the subscribers that read the changed slice,
 * rather than re-rendering every context consumer on each keystroke.
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
 * Create a minimal observable store. `set` takes a value or an updater; a
 * write that returns the same reference is a no-op and skips notifying, so a
 * "return prev when nothing changed" updater avoids spurious re-renders.
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
 * `selector` must return a stable reference when its slice hasn't changed:
 * return a stored value, not a freshly-built object/array, or pass an
 * `isEqual`. A selector that always allocates makes `getSnapshot` return a
 * new reference every call and loops.
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
  // Cache the last selected value so an unrelated write doesn't re-render us
  // unless our slice changed. useSyncExternalStore compares snapshots by
  // Object.is, so returning the cached reference is how we bail out.
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
