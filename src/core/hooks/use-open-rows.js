"use client";

/**
 * @file Which rows of a repeatable editor are expanded.
 *
 * Held by the list rather than by each row, and keyed by index, so it has to be
 * remapped whenever rows move. A row that owns its own open flag loses it the
 * moment the list is reordered: React reuses components by key, so the state
 * stays with the position while the content moves out from under it.
 */

import { useCallback, useState } from "react";

import { dropIndex, moveIndex } from "../../shared/util/list-ops.js";

/**
 * @returns {{
 *   isOpen: (index: number) => boolean,
 *   toggle: (index: number) => void,
 *   open: (index: number) => void,
 *   afterRemove: (index: number) => void,
 *   afterMove: (from: number, to: number) => void,
 * }}
 *   Call `afterRemove` / `afterMove` alongside the matching list op, with the
 *   same indices.
 */
export function useOpenRows() {
  const [rows, setRows] = useState(/** @type {Set<number>} */ (() => new Set()));

  const toggle = useCallback((/** @type {number} */ index) => {
    setRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const open = useCallback((/** @type {number} */ index) => {
    setRows((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, []);

  const afterRemove = useCallback((/** @type {number} */ index) => {
    setRows((prev) => dropIndex(prev, index));
  }, []);

  const afterMove = useCallback((/** @type {number} */ from, /** @type {number} */ to) => {
    setRows((prev) => moveIndex(prev, from, to));
  }, []);

  return {
    isOpen: useCallback((/** @type {number} */ index) => rows.has(index), [rows]),
    toggle,
    open,
    afterRemove,
    afterMove,
  };
}
