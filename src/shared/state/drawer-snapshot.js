/**
 * @file What the drawer was showing, held for the browser tab so a remount under
 * a new `[locale]` or a reload opens it the way the editor left it.
 */

/**
 * @typedef {Object} DrawerSnapshot
 * @property {boolean} open
 * @property {string} mode
 * @property {{ key: string, scope: "page" | "global" } | null} collection
 * @property {string} tab
 * @property {boolean} preview
 * @property {string} search
 * @property {boolean} changedOnly
 * @property {"comfortable" | "compact"} density
 * @property {string[]} closedGroups
 * @property {{ slug: string, path: string } | null} activeBlock
 * @property {{ slug: string, top: number } | null} scroll
 */

const PREFIX = "inscribed:drawer:";

/** @param {{ baseUrl: string, clientKey?: string | null }} config */
export function drawerSnapshotKey(config) {
  return `${config.baseUrl}|${config.clientKey ?? ""}`;
}

/**
 * @param {string} key
 * @returns {Partial<DrawerSnapshot> | null}
 */
export function readDrawerSnapshot(key) {
  try {
    return JSON.parse(sessionStorage.getItem(PREFIX + key) ?? "null");
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {DrawerSnapshot} snapshot
 */
export function writeDrawerSnapshot(key, snapshot) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(snapshot));
  } catch {
    // Storage off or full: the drawer starts fresh next time instead.
  }
}

/** @param {string} key */
export function clearDrawerSnapshot(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing was stored.
  }
}
