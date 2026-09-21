/**
 * @file Pure path-based accessors for block arrays/maps. No React, no I/O.
 */

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Read the `value` of a block by its dot-notation path.
 *
 * @param {Iterable<BlockResponse> | Map<string, BlockResponse>} blocks
 * @param {string} blockPath
 * @returns {*} The block's value, or `undefined` if no such block.
 */
export function getBlockValue(blocks, blockPath) {
  const block = getBlock(blocks, blockPath);
  return block ? block.value : undefined;
}

/**
 * Read a full block by its path.
 *
 * @param {Iterable<BlockResponse> | Map<string, BlockResponse>} blocks
 * @param {string} blockPath
 * @returns {BlockResponse|undefined}
 */
export function getBlock(blocks, blockPath) {
  if (blocks instanceof Map) return blocks.get(blockPath);
  for (const block of blocks) {
    if (block.blockPath === blockPath) return block;
  }
  return undefined;
}

/**
 * Return all blocks whose path starts with the given prefix (followed by `.`
 * or matching exactly). Order is preserved from the input.
 *
 * @param {Iterable<BlockResponse> | Map<string, BlockResponse>} blocks
 * @param {string} prefix
 * @returns {BlockResponse[]}
 */
export function groupBlocksByPrefix(blocks, prefix) {
  const iterable = blocks instanceof Map ? blocks.values() : blocks;
  /** @type {BlockResponse[]} */
  const out = [];
  for (const block of iterable) {
    if (
      block.blockPath === prefix ||
      block.blockPath.startsWith(prefix + ".")
    ) {
      out.push(block);
    }
  }
  return out;
}

/**
 * One block as a page sees it: the route's own, else the language's globals.
 *
 * The two live in separate store entries, so this is the lookup every surface
 * that addresses a block by path goes through. A route the site has no entry
 * for still resolves its globals, which is what makes a header the same on
 * every page rather than only on the pages the CMS happens to know.
 *
 * A path the page defines wins over a global of the same name. That should not
 * happen, and the rule exists so it is decided in one place if it does.
 *
 * @param {Map<string, Map<string, BlockResponse>>} state
 * @param {string} routeKey
 * @param {string} globalsKey
 * @param {string} blockPath
 * @returns {BlockResponse|undefined}
 */
export function readBlock(state, routeKey, globalsKey, blockPath) {
  return state.get(routeKey)?.get(blockPath) ?? state.get(globalsKey)?.get(blockPath);
}

/**
 * Every block a route renders, its own first and the globals after it.
 *
 * Allocates, so it belongs in a `useMemo` over the two entries rather than in a
 * store selector, which has to return a stable reference.
 *
 * @param {Map<string, BlockResponse>} own
 * @param {Map<string, BlockResponse>} globals
 * @returns {Map<string, BlockResponse>}
 */
export function mergeRouteBlocks(own, globals) {
  if (globals.size === 0) return own;
  if (own.size === 0) return globals;
  const merged = new Map(own);
  for (const [path, block] of globals) {
    if (!merged.has(path)) merged.set(path, block);
  }
  return merged;
}

/**
 * Build a Map keyed by `blockPath` from a block array.
 *
 * Every block reaching the runtime passes through here (SSR seed, refetch,
 * merge), which used to make it the one place the pre-4.0 `Text` alias was
 * folded into `LongText`. The type vocabulary is one set now and the backend
 * answers in it, so nothing is rewritten on the way in.
 *
 * @param {BlockResponse[]} blocks
 * @returns {Map<string, BlockResponse>}
 */
export function indexBlocksByPath(blocks) {
  const map = new Map();
  for (const block of blocks) map.set(block.blockPath, block);
  return map;
}