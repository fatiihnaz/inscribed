"use client";

/**
 * @file Moves inside the drawer that a card deep in its list can ask for,
 * without the drawer threading callbacks through every memoised row between.
 */

import { createContext, useContext } from "react";

/**
 * @typedef {Object} DrawerNav
 * @property {(collectionKey: string, slug: string) => void} openRecord
 *   Leave the page list for the collections area, on this record.
 */

export const DrawerNavContext = createContext(/** @type {DrawerNav | null} */ (null));

/** @returns {DrawerNav | null}  Null outside the drawer. */
export function useDrawerNav() {
  return useContext(DrawerNavContext);
}
