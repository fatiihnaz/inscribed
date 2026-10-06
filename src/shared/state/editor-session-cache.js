/**
 * @file What an editor's session already read, kept outside React for the next
 * provider. A language switch remounts `CmsProvider` and its collection layer,
 * which would otherwise start from the published site and an empty `/me` and
 * wait a round trip for what the last provider was showing a moment ago. They
 * still read again; this only fills the gap until that answer lands.
 *
 * Memory only and keyed by user, so it never outlives the tab or reaches
 * another account. Sign-out drops it. Inert on the server, where module state
 * is shared by every request and so by every user.
 */

/**
 * @typedef {Object} EditorSession
 * @property {() => Map<string, Map<string, import("../contracts/schemas.js").BlockResponse>>} [carry]
 *   The last provider's blocks store as it stands, every language it had read,
 *   with its unsent drafts written in.
 * @property {import("../contracts/schemas.js").MyCollectionResponse[]} [myCollections]
 *   The last `/me` answer.
 */

/** @type {Map<string, EditorSession>} */
const sessions = new Map();

const inBrowser = typeof window !== "undefined";

/**
 * @param {{ baseUrl: string, clientKey?: string | null }} config
 * @param {string | null | undefined} userSub
 * @returns {string | null}  Null without a user or outside the browser, which turns every call below into a no-op.
 */
export function editorSessionKey(config, userSub) {
  return inBrowser && userSub ? `${config.baseUrl}|${config.clientKey ?? ""}|${userSub}` : null;
}

/**
 * @param {string | null} key
 * @returns {EditorSession | null}
 */
export function readEditorSession(key) {
  return key ? sessions.get(key) ?? null : null;
}

/**
 * @param {string | null} key
 * @param {EditorSession} patch
 */
export function keepEditorSession(key, patch) {
  if (key) sessions.set(key, { ...sessions.get(key), ...patch });
}

/** @param {string | null} key */
export function dropEditorSession(key) {
  if (key) sessions.delete(key);
}
