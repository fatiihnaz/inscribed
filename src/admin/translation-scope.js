/**
 * @file When a block edit is big enough to be worth offering in the other
 * languages, and how many of them get an editor rather than a note.
 *
 * Only prose types qualify. "Translate this" is a meaningful offer for a
 * sentence and a meaningless one for a date, an image or a link target, and a
 * List's fields would need a per-field answer rather than a per-block one.
 */

import { diffWords, stripHtml } from "./word-diff.js";

/** Types whose value is prose an editor would restate in another language. */
export const TRANSLATABLE_BLOCK_TYPES = new Set(["ShortText", "LongText", "RichText"]);

/**
 * Changed words below this read as a typo fix, a renamed product, a corrected
 * date: things whose translation the editor either already handled or does not
 * need prompting about. Above it the sentence has been rewritten.
 */
export const TRANSLATION_MIN_CHANGED_WORDS = 4;

/**
 * Languages that get an inline editor under the block. Past this the prompt
 * would be taller than the thing being edited, so it degrades to a one-line
 * note the editor can dismiss.
 */
export const TRANSLATION_INLINE_MAX = 3;

/**
 * Above this the O(N·M) diff stops being worth its cost on a debounce, and any
 * difference at that length is substantial by definition.
 */
const MAX_DIFF_WORDS = 1200;

/**
 * @param {string} blockType
 * @param {*} value
 * @returns {string}
 */
function toPlainText(blockType, value) {
  if (blockType === "RichText") return stripHtml(value);
  return value == null ? "" : String(value);
}

/**
 * @param {string} text
 * @returns {number}
 */
function wordCount(text) {
  const tokens = text.match(/\S+/g);
  return tokens ? tokens.length : 0;
}

/**
 * Whether this edit rewrote enough of the block to be worth offering in the
 * other languages.
 *
 * @param {string} blockType
 * @param {*} prev  The published value.
 * @param {*} next  The draft.
 * @returns {boolean}
 */
export function isSubstantialChange(blockType, prev, next) {
  if (!TRANSLATABLE_BLOCK_TYPES.has(blockType)) return false;

  const a = toPlainText(blockType, prev);
  const b = toPlainText(blockType, next);
  if (a === b) return false;

  const aWords = wordCount(a);
  const bWords = wordCount(b);
  // One side empty: nothing to align, so the whole of the other side changed.
  if (aWords === 0 || bWords === 0) {
    return Math.max(aWords, bWords) >= TRANSLATION_MIN_CHANGED_WORDS;
  }
  if (aWords > MAX_DIFF_WORDS || bWords > MAX_DIFF_WORDS) return true;

  let changed = 0;
  for (const op of diffWords(a, b)) {
    if (op.type === "unchanged") continue;
    changed += wordCount(op.text);
    if (changed >= TRANSLATION_MIN_CHANGED_WORDS) return true;
  }
  return false;
}
