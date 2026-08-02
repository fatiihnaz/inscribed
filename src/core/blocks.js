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
 * Build a Map keyed by `blockPath` from a block array.
 *
 * Every block reaching the runtime passes through here (SSR seed, refetch,
 * merge), which is why the one legacy type is folded here rather than in each
 * type switch downstream: `Text` was the pre-4.0 alias of `LongText`, and while
 * the reference backend rewrites it on write, a custom transport can still hand
 * one over. Blocks that need no rewrite keep their identity.
 *
 * @param {BlockResponse[]} blocks
 * @returns {Map<string, BlockResponse>}
 */
export function indexBlocksByPath(blocks) {
  const map = new Map();
  for (const block of blocks) {
    map.set(
      block.blockPath,
      block.blockType === "Text" ? { ...block, blockType: "LongText" } : block,
    );
  }
  return map;
}