/**
 * @file Tiny word-level inline diff. Renders block changes in the drawer's
 * preview as one line of removed (red) and added (green) runs around unchanged
 * context.
 *
 * Algorithm: classic LCS DP with backtrace, then adjacent same-type ops are
 * merged into one run per segment. The tokeniser keeps whitespace as its own
 * token so the rendered diff preserves the original spacing.
 *
 * Scope: short blocks (a paragraph, a sentence, a URL). It's O(N·M) in
 * time/space, fine in practice but not meant for novel-length input.
 */

/**
 * @typedef {{ type: "unchanged" | "removed" | "added", text: string }} DiffOp
 */

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {DiffOp[]}
 */
export function diffWords(a, b) {
  const ops = lcsDiff(tokenize(a ?? ""), tokenize(b ?? ""));
  return refineSimilarSwaps(ops);
}

/**
 * Generic LCS-DP diff over a token array. The same code path drives the
 * word-level pass (above) and the char-level refinement (below). DP cells
 * use Uint16 because realistic block content stays well under 65535
 * tokens per side; the refinement pass runs only on short swap pairs.
 *
 * `merge` controls whether adjacent same-type ops are concatenated.
 * Word/char passes want this (otherwise every token becomes its own op);
 * line-level callers do not (the line boundary IS the unit, and the
 * renderer needs one op per line for row-by-row classification).
 *
 * @param {string[]} A
 * @param {string[]} B
 * @param {boolean} [merge]
 * @returns {DiffOp[]}
 */
function lcsDiff(A, B, merge = true) {
  const n = A.length;
  const m = B.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ type: "added", text: B.join("") }];
  if (m === 0) return [{ type: "removed", text: A.join("") }];

  /** @type {Uint16Array[]} */
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      dp[i + 1][j + 1] = A[i] === B[j]
        ? dp[i][j] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  /** @type {DiffOp[]} */
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      ops.push({ type: "unchanged", text: A[i - 1] });
      i--; j--;
    } else if (dp[i][j - 1] >= dp[i - 1][j]) {
      ops.push({ type: "added", text: B[j - 1] });
      j--;
    } else {
      ops.push({ type: "removed", text: A[i - 1] });
      i--;
    }
  }
  while (i > 0) { ops.push({ type: "removed", text: A[--i] }); }
  while (j > 0) { ops.push({ type: "added", text: B[--j] }); }
  ops.reverse();

  return merge ? mergeRuns(ops) : ops;
}

const REFINE_MAX_LEN = 60;
const REFINE_MIN_SIMILARITY = 0.4;

/**
 * Post-process: when a removed run is immediately followed by a short, similar
 * added run (one string edited into another), re-diff at the character level
 * so typos / suffix changes show as fine highlights instead of two big blobs.
 *
 * Skipped when the pair is too long (cost) or too dissimilar (the char diff
 * would be confetti of one-letter ops).
 *
 * @param {DiffOp[]} ops
 * @returns {DiffOp[]}
 */
function refineSimilarSwaps(ops) {
  /** @type {DiffOp[]} */
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const cur = ops[i];
    const nxt = ops[i + 1];
    if (
      cur.type === "removed" && nxt && nxt.type === "added"
      && cur.text.length <= REFINE_MAX_LEN
      && nxt.text.length <= REFINE_MAX_LEN
      && similarityRatio(cur.text, nxt.text) >= REFINE_MIN_SIMILARITY
    ) {
      const chars = lcsDiff([...cur.text], [...nxt.text]);
      out.push(...chars);
      i++; // consume the added partner
      continue;
    }
    out.push(cur);
  }
  return mergeRuns(out);
}

/**
 * Cheap similarity ratio in [0, 1]: LCS length over max length. Used as
 * a gate so unrelated swaps don't degrade into noisy character diffs.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarityRatio(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  /** @type {Uint16Array[]} */
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      dp[i + 1][j + 1] = a[i] === b[j]
        ? dp[i][j] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[n][m] / Math.max(n, m);
}

/**
 * Split on word vs non-word boundaries, keeping every character. The
 * whitespace tokens carry their own slot so rendering joins them back
 * into the original spacing without manual reconstruction.
 *
 * @param {string} s
 * @returns {string[]}
 */
function tokenize(s) {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * @param {DiffOp[]} ops
 * @returns {DiffOp[]}
 */
function mergeRuns(ops) {
  /** @type {DiffOp[]} */
  const out = [];
  for (const op of ops) {
    const prev = out[out.length - 1];
    if (prev && prev.type === op.type) prev.text += op.text;
    else out.push({ type: op.type, text: op.text });
  }
  return out;
}

/**
 * Line-level LCS diff: split on newlines, then run the same LCS pass to
 * classify lines as unchanged/removed/added. Used by the changes panel's
 * unified view for RichText (where paragraph/`<br>` boundaries matter);
 * text-only blocks stay on the inline word diff.
 *
 * Each op carries `text` without the trailing newline. Removed/added line
 * pairs aren't auto-paired here; the renderer does the intra-line word diff.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {DiffOp[]}
 */
export function diffLines(a, b) {
  return lcsDiff(splitForLines(a), splitForLines(b), false);
}

const LONG_LINE_THRESHOLD = 120;

/**
 * Tokenise a string into "lines" for the unified diff. Splits on newlines
 * first; any run longer than `LONG_LINE_THRESHOLD` is further split on
 * sentence boundaries, so a long paragraph isn't compared as one giant line
 * and repetitive sentences align cleanly under LCS.
 *
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
function splitForLines(text) {
  if (text == null || text === "") return [];
  const lines = String(text).split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    if (line.length <= LONG_LINE_THRESHOLD) {
      out.push(line);
      continue;
    }
    const parts = line.split(/(?<=[.!?])\s+/);
    if (parts.length === 1) {
      out.push(line);
      continue;
    }
    for (const p of parts) out.push(p);
  }
  return out;
}

/**
 * Strip HTML tags and decode the few entities the rich-text editor produces,
 * so RichText values can feed the word diff without markup churn polluting it.
 * Loses formatting but keeps the visible text the admin edited.
 *
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\/(p|div|li|h[1-6]|br)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>(?!$)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
