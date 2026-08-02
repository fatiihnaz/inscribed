"use client";

/**
 * @file `ChangesPanel`: read-only drawer preview overlay. Toggled by the
 * status bar's "Önizle" when there are unsaved edits; takes over the tab body
 * so the admin can review every dirty block before committing. Per-block
 * edit/undo stays on the Sayfa / Genel tabs.
 *
 * Diff: inline word-level red/green via `diffWords`. RichText is stripped of
 * tags first so markup churn doesn't drown the content change; a change that
 * touched only markup is reported as such instead of rendering as nothing.
 * List items are matched by content through an LCS, so a reorder reads as a
 * move rather than as a run of edits down the list.
 *
 * Collection blocks are excluded: their drafts are per-item and surface in the
 * collection's own region tab.
 */

import { useMemo } from "react";
import { Pencil } from "../shared/style/icons.jsx";

import { stableStringify } from "../shared/util/stable-stringify.js";
import { diffWords, diffLines, stripHtml, lcsIndexPairs } from "./word-diff.js";

import { emptyStateStyle } from "../editors/fields/styles.js";
import { paneStyle, listStyle, rowContainerStyle, rowHeaderStyle, rowGuideBodyStyle, rowPathStyle, typeIconStyle } from "./drawer-styles.js";
import { TEXT_MUTED, TEXT_FAINT, TEXT, HAIRLINE, SURFACE_1, RADIUS_SM, R_SM, FONT_MONO, COLLECTION_ACCENT, COLLECTION_LINE, STATUS_OK, STATUS_DANGER, STATUS_WARN, TYPE_META, TYPE_META_FALLBACK, FONT_SANS } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse, BlockType, ItemSchema } from "../shared/contracts/schemas.js"
 * @import { DiffOp } from "./word-diff.js"
 */

const DIFF_ADDED = STATUS_OK;
const DIFF_REMOVED = STATUS_DANGER;
const DIFF_CHANGED = STATUS_WARN;

// RichText is excluded on purpose: it strips HTML before diffing.
const TEXTY_BLOCK_TYPES = new Set(["ShortText", "LongText"]);

/**
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   dirtyByPath: Map<string, boolean>,
 *   itemSchemas: Map<string, ItemSchema>,
 *   collectionDirtyCounts: Map<string, Set<string>>,
 *   onGoToBlock: (block: BlockResponse) => void,
 *   onGoToCollection: (collectionKey: string) => void,
 * }} props
 */
export function ChangesPanel({
  blockList, drafts, dirtyByPath, itemSchemas,
  collectionDirtyCounts, onGoToBlock, onGoToCollection,
}) {
  const dirty = useMemo(
    () => blockList.filter(
      (b) => b.blockType !== "Collection" && dirtyByPath.get(b.blockPath),
    ),
    [blockList, dirtyByPath],
  );
  const collectionEntries = useMemo(
    () => [...collectionDirtyCounts.entries()]
      .map(([key, set]) => ({ key, count: set.size }))
      .filter((e) => e.count > 0)
      .sort((a, b) => a.key.localeCompare(b.key)),
    [collectionDirtyCounts],
  );

  const isEmpty = dirty.length === 0 && collectionEntries.length === 0;

  return (
    <section style={paneStyle}>
      <div style={scrollStyle}>
        {isEmpty ? (
          <div style={emptyStateStyle}>
            Henüz değişiklik yok.
          </div>
        ) : (
          <ul style={listStyle} data-cms-list>
            {collectionEntries.map((entry) => (
              <li key={`coll:${entry.key}`} style={{ listStyle: "none" }}>
                <CollectionDraftCard
                  collectionKey={entry.key}
                  count={entry.count}
                  onGoToCollection={onGoToCollection}
                />
              </li>
            ))}
            {dirty.map((block) => (
              <li key={block.blockPath} style={{ listStyle: "none" }}>
                <BlockDiffCard
                  block={block}
                  draft={drafts.get(block.blockPath)}
                  itemSchema={itemSchemas.get(block.blockPath) ?? null}
                  onGoToBlock={onGoToBlock}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Header-only card for a collection with pending item drafts. Same scaffolding
 * as `BlockDiffCard` so it slots into the same list. No body: the count is a
 * pointer, the Düzenle button is the way in.
 *
 * @param {{
 *   collectionKey: string,
 *   count: number,
 *   onGoToCollection: (key: string) => void,
 * }} props
 */
function CollectionDraftCard({ collectionKey, count, onGoToCollection }) {
  const meta = TYPE_META.Collection;
  return (
    <div style={rowContainerStyle}>
      <div style={rowHeaderStyle}>
        <span aria-hidden="true" style={{ ...typeIconStyle, color: TEXT_MUTED }}>
          {meta.glyph}
        </span>
        <span style={rowPathStyle} title={collectionKey}>
          {collectionKey}
        </span>
        <span style={collectionDraftCountStyle}>
          {count} taslak
        </span>
        <button
          type="button"
          onClick={() => onGoToCollection(collectionKey)}
          className="inscribed-icon-button"
          style={goToButtonStyle}
          aria-label={`${collectionKey} koleksiyonunu aç`}
          title="Koleksiyonu aç"
        >
          <Pencil size={11} />
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   itemSchema: ItemSchema | null,
 *   onGoToBlock: (block: BlockResponse) => void,
 * }} props
 */
function BlockDiffCard({ block, draft, itemSchema, onGoToBlock }) {
  const meta = TYPE_META[block.blockType] ?? TYPE_META_FALLBACK;
  const next = draft !== undefined ? draft : block.draftValue;
  const prev = block.value;

  // Compute line ops once and pass down as `sharedOps` to avoid a second LCS pass.
  const ops = useMemo(() => {
    if (TEXTY_BLOCK_TYPES.has(block.blockType) || block.blockType === "RichText") {
      const a = block.blockType === "RichText" ? stripHtml(prev) : String(prev ?? "");
      const b = block.blockType === "RichText" ? stripHtml(next) : String(next ?? "");
      return diffLines(a, b);
    }
    return null;
  }, [block.blockType, prev, next]);

  return (
    <div style={rowContainerStyle}>
      <div style={rowHeaderStyle}>
        {/* Monochrome like the block list's glyphs: every row carries one, so
            per-type colour would turn the list into confetti. */}
        <span aria-hidden="true" style={{ ...typeIconStyle, color: TEXT_MUTED }}>
          {meta.glyph}
        </span>
        <span style={rowPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>
        <button
          type="button"
          onClick={() => onGoToBlock(block)}
          className="inscribed-icon-button"
          style={goToButtonStyle}
          aria-label={`${block.blockPath} bloğunu düzenle`}
          title="Bu bloğu düzenle"
        >
          <Pencil size={11} />
        </button>
      </div>
      <div style={rowGuideBodyStyle}>
        <DiffContent
          blockType={block.blockType}
          prev={prev}
          next={next}
          itemSchema={itemSchema}
          sharedOps={ops}
        />
      </div>
    </div>
  );
}

/**
 * Type-dispatched diff renderer, shared by top-level block diffs and per-field
 * list-item diffs.
 *
 * @param {{
 *   blockType: BlockType | string,
 *   prev: *,
 *   next: *,
 *   itemSchema?: ItemSchema | null,
 *   sharedOps?: DiffOp[] | null,
 * }} props
 */
function DiffContent({ blockType, prev, next, itemSchema, sharedOps }) {
  switch (blockType) {
    case "ShortText":
    case "LongText":
      return (
        <LineDiff
          prev={String(prev ?? "")}
          next={String(next ?? "")}
          ops={sharedOps ?? undefined}
        />
      );
    case "RichText":
      return <RichTextDiff prev={prev} next={next} ops={sharedOps ?? undefined} />;
    case "Link":
      return <LinkDiff prev={prev} next={next} />;
    case "Date":
      return <ArrowDiff prev={prev} next={next} />;
    case "Image":
      return <ImageDiff prev={prev} next={next} />;
    case "List":
      return (
        <ListDiff
          oldItems={Array.isArray(prev) ? prev : []}
          newItems={Array.isArray(next) ? next : []}
          itemSchema={itemSchema ?? null}
        />
      );
    default:
      return (
        <InlineWordDiff
          prev={typeof prev === "string" ? prev : stableStringify(prev)}
          next={typeof next === "string" ? next : stableStringify(next)}
        />
      );
  }
}

/**
 * @param {{ prev: string, next: string, ops?: DiffOp[] }} props
 */
function InlineWordDiff({ prev, next, ops: providedOps }) {
  const ops = useMemo(
    () => collapseUnchanged(providedOps ?? diffWords(prev, next)),
    [providedOps, prev, next],
  );
  if (ops.length === 0) {
    return <div style={diffBoxStyle}><span style={emptyValueStyle}>—</span></div>;
  }
  return (
    <div style={{ ...diffBoxStyle, ...inlineDiffStyle }}>
      {ops.map((op, i) => (
        <DiffSpan key={i} op={op} />
      ))}
    </div>
  );
}

const COLLAPSE_THRESHOLD_WORDS = 14;
const COLLAPSE_KEEP_PER_SIDE = 3;

/**
 * Replace long unchanged context with a compact pill so the diff body
 * stays focused on what actually changed. Keeps a few words of context
 * on each side of the elision (or just one side when the run sits at
 * the start / end of the diff) so the surrounding edit still reads in
 * place. Short unchanged runs pass through untouched.
 *
 * @param {DiffOp[]} ops
 * @returns {(DiffOp | { type: "collapsed", count: number })[]}
 */
function collapseUnchanged(ops) {
  /** @type {(DiffOp | { type: "collapsed", count: number })[]} */
  const out = [];
  ops.forEach((op, idx) => {
    if (op.type !== "unchanged") {
      out.push(op);
      return;
    }
    const tokens = op.text.match(/\s+|[^\s]+/g) ?? [];
    const wordCount = tokens.filter((t) => /\S/.test(t)).length;
    if (wordCount <= COLLAPSE_THRESHOLD_WORDS) {
      out.push(op);
      return;
    }
    const isFirst = idx === 0;
    const isLast = idx === ops.length - 1;
    const keepLead = isFirst ? 0 : COLLAPSE_KEEP_PER_SIDE;
    const keepTail = isLast ? 0 : COLLAPSE_KEEP_PER_SIDE;
    const leadEnd = boundaryByWords(tokens, keepLead, "forward");
    const tailStart = boundaryByWords(tokens, keepTail, "backward");
    const head = tokens.slice(0, leadEnd).join("");
    const tail = tokens.slice(tailStart).join("");
    const collapsed = wordCount - keepLead - keepTail;
    if (head) out.push({ type: "unchanged", text: head });
    out.push({ type: "collapsed", count: collapsed });
    if (tail) out.push({ type: "unchanged", text: tail });
  });
  return out;
}

/**
 * Find the slice boundary after (forward) or before (backward) the first
 * `wordsKept` word tokens. Whitespace is carried along so rejoining preserves
 * spacing.
 *
 * @param {string[]} tokens
 * @param {number} wordsKept
 * @param {"forward" | "backward"} dir
 * @returns {number}
 */
function boundaryByWords(tokens, wordsKept, dir) {
  if (wordsKept === 0) return dir === "forward" ? 0 : tokens.length;
  let seen = 0;
  if (dir === "forward") {
    for (let i = 0; i < tokens.length; i++) {
      if (/\S/.test(tokens[i])) {
        seen++;
        if (seen === wordsKept) return i + 1;
      }
    }
    return tokens.length;
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/\S/.test(tokens[i])) {
      seen++;
      if (seen === wordsKept) return i;
    }
  }
  return 0;
}

/**
 * @param {{ op: DiffOp | { type: "collapsed", count: number } }} props
 */
function DiffSpan({ op }) {
  if (op.type === "unchanged") {
    return <span style={unchangedSpanStyle}>{op.text}</span>;
  }
  if (op.type === "removed") {
    return <span style={removedSpanStyle}>{op.text}</span>;
  }
  if (op.type === "added") {
    return <span style={addedSpanStyle}>{op.text}</span>;
  }
  return (
    <span style={collapsedSpanStyle} aria-label={`${op.count} kelime gizlendi`}>
      …
    </span>
  );
}

const HUNK_THRESHOLD_LINES = 6;
const HUNK_KEEP_PER_SIDE = 2;
const PAIR_MIN_SIMILARITY = 0.4;

/**
 * GitHub-style unified line diff for RichText (and any newline-carrying value).
 * Each `diffLines` op is one row; adjacent removed/added pairs that look like a
 * single-line edit render as one paired row with intra-line word highlights,
 * else they stack. Long unchanged runs collapse to a "@@ … N satır @@" hunk.
 *
 * @param {{ prev: string, next: string, ops?: DiffOp[] }} props
 */
function LineDiff({ prev, next, ops: providedOps }) {
  const rows = useMemo(() => {
    const ops = providedOps ?? diffLines(prev, next);
    return applyHunks(buildLineRows(ops));
  }, [providedOps, prev, next]);

  if (rows.length === 0) {
    return <div style={diffBoxStyle}><span style={emptyValueStyle}>—</span></div>;
  }

  return (
    <div style={lineDiffWrapStyle}>
      {rows.map((row, i) => (
        <LineRow key={i} row={row} />
      ))}
    </div>
  );
}

/**
 * Walk the line ops to attach old/new line numbers and pair adjacent
 * removed+added ops into one "changed" row when they resemble an edit.
 *
 * @param {DiffOp[]} ops
 * @returns {LineRow[]}
 */
function buildLineRows(ops) {
  /** @type {LineRow[]} */
  const rows = [];
  let oldLine = 1;
  let newLine = 1;
  for (let i = 0; i < ops.length; i++) {
    const cur = ops[i];
    const nxt = ops[i + 1];
    if (
      cur.type === "removed" && nxt && nxt.type === "added"
      && lineSimilarity(cur.text, nxt.text) >= PAIR_MIN_SIMILARITY
    ) {
      rows.push({
        kind: "changed",
        oldLine, newLine,
        oldText: cur.text,
        newText: nxt.text,
      });
      oldLine++;
      newLine++;
      i++; // consume the paired added op
      continue;
    }
    if (cur.type === "unchanged") {
      rows.push({ kind: "unchanged", oldLine, newLine, text: cur.text });
      oldLine++;
      newLine++;
      continue;
    }
    if (cur.type === "removed") {
      rows.push({ kind: "removed", oldLine, newLine: null, text: cur.text });
      oldLine++;
      continue;
    }
    rows.push({ kind: "added", oldLine: null, newLine, text: cur.text });
    newLine++;
  }
  return rows;
}

/**
 * Replace long unchanged runs with a hunk-separator row, keeping
 * `HUNK_KEEP_PER_SIDE` lines of context per boundary (zero at the start/end).
 *
 * @param {LineRow[]} rows
 * @returns {LineRow[]}
 */
function applyHunks(rows) {
  /** @type {LineRow[]} */
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "unchanged") {
      out.push(rows[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === "unchanged") j++;
    const run = j - i;
    if (run <= HUNK_THRESHOLD_LINES) {
      for (let k = i; k < j; k++) out.push(rows[k]);
    } else {
      const isStart = i === 0;
      const isEnd = j === rows.length;
      const keepLead = isStart ? 0 : HUNK_KEEP_PER_SIDE;
      const keepTail = isEnd ? 0 : HUNK_KEEP_PER_SIDE;
      for (let k = i; k < i + keepLead; k++) out.push(rows[k]);
      out.push({ kind: "hunk", count: run - keepLead - keepTail });
      for (let k = j - keepTail; k < j; k++) out.push(rows[k]);
    }
    i = j;
  }
  return out;
}

/**
 * Cheap line-similarity ratio for the row-pairing gate (local copy of
 * `word-diff.js`'s `similarityRatio` so LineDiff stays self-contained).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function lineSimilarity(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  if (n > 200 || m > 200) {
    // Skip the O(N·M) walk on long lines; gate on common-prefix length instead.
    let commonPrefix = 0;
    const max = Math.min(n, m);
    while (commonPrefix < max && a[commonPrefix] === b[commonPrefix]) commonPrefix++;
    return commonPrefix / Math.max(n, m);
  }
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
 * @typedef {(
 *   | { kind: "unchanged", oldLine: number, newLine: number, text: string }
 *   | { kind: "removed", oldLine: number, newLine: null, text: string }
 *   | { kind: "added", oldLine: null, newLine: number, text: string }
 *   | { kind: "changed", oldLine: number, newLine: number, oldText: string, newText: string }
 *   | { kind: "hunk", count: number }
 * )} LineRow
 */

/**
 * @param {{ row: LineRow }} props
 */
function LineRow({ row }) {
  if (row.kind === "hunk") {
    return (
      <div style={lineHunkStyle} aria-label={`${row.count} satır gizlendi`}>…</div>
    );
  }
  if (row.kind === "changed") {
    return <ChangedLinePair row={row} />;
  }
  const tone =
    row.kind === "added" ? lineAddedStyle
    : row.kind === "removed" ? lineRemovedStyle
    : lineUnchangedStyle;
  const glyph = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
  return (
    <div style={{ ...lineRowBase, ...tone }}>
      <span style={lineGutterStyle}>{glyph}</span>
      <span style={lineTextStyle}>{renderLineText(row.text)}</span>
    </div>
  );
}

const LONG_TEXT_THRESHOLD = 400;
const LONG_TEXT_KEEP_PER_SIDE = 80;

/**
 * Render a row's full text, but for very long content (a whole paragraph
 * removed) keep head + tail and drop the middle behind a character-count pill
 * so the diff stays scannable.
 *
 * @param {string} text
 * @returns {React.ReactNode}
 */
function renderLineText(text) {
  if (!text) return " ";
  if (text.length <= LONG_TEXT_THRESHOLD) return text;
  const head = text.slice(0, LONG_TEXT_KEEP_PER_SIDE);
  const tail = text.slice(-LONG_TEXT_KEEP_PER_SIDE);
  const omitted = text.length - 2 * LONG_TEXT_KEEP_PER_SIDE;
  return (
    <>
      <span>{head}</span>
      <span style={collapsedInlineStyle} aria-label={`${omitted} karakter gizlendi`}>
        … {omitted} karakter …
      </span>
      <span>{tail}</span>
    </>
  );
}

/**
 * Render both sides of a "changed" line pair from a single intra-line
 * word diff, so the O(N·M) word LCS only runs once per changed row.
 *
 * @param {{ row: { kind: "changed", oldLine: number, newLine: number, oldText: string, newText: string } }} props
 */
function ChangedLinePair({ row }) {
  const ops = useMemo(
    () => diffWords(row.oldText, row.newText),
    [row.oldText, row.newText],
  );
  return (
    <>
      <PairedLine kind="removed" oldLine={row.oldLine} newLine={null} ops={ops} side="prev" />
      <PairedLine kind="added" oldLine={null} newLine={row.newLine} ops={ops} side="next" />
    </>
  );
}

/**
 * One side of a paired "changed" line. Filters the shared intra-line ops to
 * this side's segments (unchanged + removed for prev, unchanged + added for
 * next) so the line reconstructs with the differing runs highlighted.
 *
 * @param {{
 *   kind: "added" | "removed",
 *   oldLine: number | null,
 *   newLine: number | null,
 *   ops: DiffOp[],
 *   side: "prev" | "next",
 * }} props
 */
function PairedLine({ kind, oldLine, newLine, ops, side }) {
  // Filter to this side, then collapse long unchanged context so a small edit
  // in a long paragraph doesn't render as walls of muted text.
  const sideOps = useMemo(
    () => collapseUnchanged(
      ops.filter((op) => op.type === "unchanged"
        || (side === "prev" ? op.type === "removed" : op.type === "added")),
    ),
    [ops, side],
  );
  const tone = kind === "added" ? lineAddedStyle : lineRemovedStyle;
  const glyph = kind === "added" ? "+" : "-";
  return (
    <div style={{ ...lineRowBase, ...tone }}>
      <span style={lineGutterStyle}>{glyph}</span>
      <span style={lineTextStyle}>
        {sideOps.length === 0 ? " " : sideOps.map((op, i) => {
          if (op.type === "unchanged") return <span key={i}>{op.text}</span>;
          if (op.type === "removed") return <span key={i} style={pairedRemovedSpanStyle}>{op.text}</span>;
          if (op.type === "added") return <span key={i} style={pairedAddedSpanStyle}>{op.text}</span>;
          return (
            <span key={i} style={collapsedInlineStyle} aria-label={`${op.count} kelime gizlendi`}>
              …
            </span>
          );
        })}
      </span>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
// Marks worth naming when only the markup moved. Anything outside this map is
// rolled into a generic count rather than shown as a raw tag name.
const RICH_MARKS = [
  { tag: "strong", label: "kalın" },
  { tag: "b", label: "kalın" },
  { tag: "em", label: "italik" },
  { tag: "i", label: "italik" },
  { tag: "s", label: "üstü çizili" },
  { tag: "a", label: "bağlantı" },
  { tag: "h2", label: "başlık" },
  { tag: "h3", label: "alt başlık" },
  { tag: "blockquote", label: "alıntı" },
  { tag: "li", label: "liste öğesi" },
  { tag: "code", label: "kod" },
];

/**
 * Count each named mark's opening tags, so a formatting-only edit can be
 * described instead of rendered as an empty diff.
 *
 * @param {string} html
 * @returns {Map<string, number>}
 */
function countMarks(html) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  if (!html) return counts;
  for (const { tag, label } of RICH_MARKS) {
    const hits = String(html).match(new RegExp(`<${tag}(\\s[^>]*)?>`, "gi"));
    if (hits) counts.set(label, (counts.get(label) ?? 0) + hits.length);
  }
  return counts;
}

/**
 * RichText diffs on its stripped text, which means a change that touched only
 * markup used to render as a card with nothing in it. Detect that case and
 * report which marks moved instead.
 *
 * @param {{ prev: *, next: *, ops?: DiffOp[] }} props
 */
function RichTextDiff({ prev, next, ops }) {
  const prevText = useMemo(() => stripHtml(prev), [prev]);
  const nextText = useMemo(() => stripHtml(next), [next]);
  const isTextUnchanged = prevText === nextText;

  // Only worth walking the markup when the text came out identical, and the
  // scan is a regex per mark, so keep it off the render path otherwise.
  const moved = useMemo(() => {
    if (!isTextUnchanged) return [];
    const before = countMarks(prev);
    const after = countMarks(next);
    /** @type {{ label: string, delta: number }[]} */
    const out = [];
    for (const label of new Set([...before.keys(), ...after.keys()])) {
      const delta = (after.get(label) ?? 0) - (before.get(label) ?? 0);
      if (delta !== 0) out.push({ label, delta });
    }
    out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return out;
  }, [isTextUnchanged, prev, next]);

  if (!isTextUnchanged) {
    return <LineDiff prev={prevText} next={nextText} ops={ops} />;
  }

  return (
    <div style={formatOnlyStyle}>
      <span>Metin aynı, yalnızca biçimlendirme değişti.</span>
      {moved.length > 0 ? (
        <span style={formatMarksStyle}>
          {moved.map(({ label, delta }) => (
            <span
              key={label}
              style={{ ...formatMarkChipStyle, color: delta > 0 ? DIFF_ADDED : DIFF_REMOVED }}
            >
              {delta > 0 ? "+" : "−"}{Math.abs(delta)} {label}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

const formatOnlyStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: TEXT_MUTED,
});

const formatMarksStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
});

const formatMarkChipStyle = /** @type {React.CSSProperties} */ ({
  font: `500 10.5px/1 ${FONT_SANS}`,
  fontVariantNumeric: "tabular-nums",
  padding: "3px 6px",
  borderRadius: R_SM,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
});

function LinkDiff({ prev, next }) {
  const prevLabel = prev?.label ?? "";
  const nextLabel = next?.label ?? "";
  const prevHref = prev?.href ?? "";
  const nextHref = next?.href ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabeled label="label">
        <InlineWordDiff prev={prevLabel} next={nextLabel} />
      </FieldLabeled>
      <FieldLabeled label="href">
        <InlineWordDiff prev={prevHref} next={nextHref} />
      </FieldLabeled>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
function ArrowDiff({ prev, next }) {
  const a = prev == null || prev === "" ? "—" : String(prev);
  const b = next == null || next === "" ? "—" : String(next);
  return (
    <div style={{ ...diffBoxStyle, ...arrowDiffStyle }}>
      <span style={removedSpanStyle}>{a}</span>
      <span style={arrowStyle}>→</span>
      <span style={addedSpanStyle}>{b}</span>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
function ImageDiff({ prev, next }) {
  const prevSrc = prev?.src ?? null;
  const nextSrc = next?.src ?? null;
  const prevAlt = prev?.alt ?? "";
  const nextAlt = next?.alt ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={imageRowStyle}>
        <ImageSide label="Yayında" src={prevSrc} alt={prevAlt} />
        <ImageSide label="Taslak" src={nextSrc} alt={nextAlt} isNext />
      </div>
      {prevAlt !== nextAlt ? (
        <FieldLabeled label="alt">
          <InlineWordDiff prev={prevAlt} next={nextAlt} />
        </FieldLabeled>
      ) : null}
    </div>
  );
}

/**
 * @param {{ tone: string, label: string, src: string | null, alt: string }} props
 */
function ImageSide({ label, src, alt, isNext }) {
  return (
    <div style={imageSideStyle}>
      <div style={isNext ? imageLabelNextStyle : imageLabelStyle}>{label}</div>
      {src ? (
        <img src={src} alt={alt} style={imageThumbStyle} />
      ) : (
        <div style={emptyValueStyle}>—</div>
      )}
    </div>
  );
}

/**
 * Positional list diff. Classifies each index as added/removed/changed;
 * "changed" recurses into a per-field diff via the itemSchema. Unchanged items
 * are skipped.
 *
 * @param {{
 *   oldItems: Record<string, *>[],
 *   newItems: Record<string, *>[],
 *   itemSchema: ItemSchema | null,
 * }} props
 */
function ListDiff({ oldItems, newItems, itemSchema }) {
  // Match by content, not by position. Comparing index-for-index reported a
  // reorder as a run of edits: moving one item up rewrote every row it passed.
  // The LCS pins the items that kept their relative order; anything outside it
  // whose content still exists on the other side is a move, and only what is
  // left over is a real edit.
  const rows = useMemo(() => {
    const oldHashes = oldItems.map((it) => stableStringify(it));
    const newHashes = newItems.map((it) => stableStringify(it));

    const kept = new Set();
    const keptNew = new Set();
    for (const { a, b } of lcsIndexPairs(oldHashes, newHashes)) {
      kept.add(a);
      keptNew.add(b);
    }

    const looseOld = oldHashes.map((_, i) => i).filter((i) => !kept.has(i));
    const looseNew = newHashes.map((_, i) => i).filter((i) => !keptNew.has(i));

    /** @type {{ kind: "added"|"removed"|"changed"|"moved", index: number, from?: number, prev: *, next: * }[]} */
    const out = [];

    // Same content on both sides but outside the LCS: it travelled.
    const pendingNew = [...looseNew];
    const stillOld = [];
    for (const oi of looseOld) {
      const at = pendingNew.findIndex((ni) => newHashes[ni] === oldHashes[oi]);
      if (at === -1) { stillOld.push(oi); continue; }
      const ni = pendingNew.splice(at, 1)[0];
      out.push({ kind: "moved", index: ni, from: oi, prev: oldItems[oi], next: newItems[ni] });
    }

    // Whatever is left pairs up in order, so editing an item in place reads as
    // one changed row rather than a removal plus an unrelated addition. The
    // similarity gate keeps that from overreaching: deleting one item and
    // adding a different one must not be reported as an edit between them.
    const pairable = Math.min(stillOld.length, pendingNew.length);
    let paired = 0;
    while (
      paired < pairable
      && lineSimilarity(oldHashes[stillOld[paired]], newHashes[pendingNew[paired]])
         >= PAIR_MIN_SIMILARITY
    ) {
      const oi = stillOld[paired];
      const ni = pendingNew[paired];
      out.push({ kind: "changed", index: ni, prev: oldItems[oi], next: newItems[ni] });
      paired++;
    }
    for (let k = paired; k < stillOld.length; k++) {
      const oi = stillOld[k];
      out.push({ kind: "removed", index: oi, prev: oldItems[oi], next: null });
    }
    for (let k = paired; k < pendingNew.length; k++) {
      const ni = pendingNew[k];
      out.push({ kind: "added", index: ni, prev: null, next: newItems[ni] });
    }

    out.sort((a, b) => a.index - b.index);
    return out;
  }, [oldItems, newItems]);

  if (rows.length === 0) {
    return <div style={{ color: TEXT_MUTED, fontSize: 12 }}>Görünür bir değişiklik yok.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <div key={row.index} style={listItemRowStyle(row.kind)}>
          <div style={listItemHeaderStyle}>
            <span style={listItemGlyphStyle(row.kind)} aria-hidden="true">
              {GLYPH_FOR_KIND[row.kind]}
            </span>
            <span style={listItemIndexStyle}>
              {row.kind === "moved"
                ? `#${row.from + 1} → #${row.index + 1}`
                : `#${row.index + 1}`}
            </span>
            <span style={listItemBadgeStyle()}>
              {labelForKind(row.kind)}
            </span>
          </div>
          {row.kind === "moved" ? (
            // Content is identical by definition, so there is nothing to diff:
            // show the item quietly, just enough to tell which one travelled.
            <ItemFields item={row.next} itemSchema={itemSchema} tone={TEXT_MUTED} />
          ) : row.kind === "added" || row.kind === "removed" ? (
            <ItemFields
              item={row.kind === "added" ? row.next : row.prev}
              itemSchema={itemSchema}
              tone={toneForKind(row.kind)}
            />
          ) : (
            <ItemFieldDiff prev={row.prev} next={row.next} itemSchema={itemSchema} />
          )}
        </div>
      ))}
    </div>
  );
}

/** @param {"added"|"removed"|"changed"} kind */
function toneForKind(kind) {
  if (kind === "added") return DIFF_ADDED;
  if (kind === "removed") return DIFF_REMOVED;
  // A move changes no content, so it stays off the add/remove palette.
  if (kind === "moved") return TEXT_MUTED;
  return DIFF_CHANGED;
}

/** @param {"added"|"removed"|"changed"} kind */
function labelForKind(kind) {
  if (kind === "added") return "Eklendi";
  if (kind === "removed") return "Silindi";
  if (kind === "moved") return "Taşındı";
  return "Düzenlendi";
}

const GLYPH_FOR_KIND = { added: "+", removed: "−", moved: "⇅", changed: "~" };

/**
 * Render a fully added/removed item's fields with a tone tint, so it reads as
 * "the whole thing is new/gone" rather than a per-field diff.
 *
 * @param {{
 *   item: Record<string, *>,
 *   itemSchema: ItemSchema | null,
 *   tone: string,
 * }} props
 */
function ItemFields({ item, itemSchema, tone }) {
  if (!itemSchema) {
    return (
      <pre style={fallbackJsonStyle(tone)}>
        {stableStringify(item)}
      </pre>
    );
  }
  return (
    <div style={fieldStackStyle}>
      {Object.entries(itemSchema).map(([fieldKey, field]) => {
        const value = item[fieldKey];
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
          return null;
        }
        return (
          <FieldLabeled key={fieldKey} label={fieldKey}>
            <SoloValue blockType={field.blockType} value={value} tone={tone} />
          </FieldLabeled>
        );
      })}
    </div>
  );
}

/**
 * Per-field inline diff for a changed list item. Skips fields that match
 * across versions; renders the rest through `DiffContent`.
 *
 * @param {{ prev: Record<string, *>, next: Record<string, *>, itemSchema: ItemSchema | null }} props
 */
function ItemFieldDiff({ prev, next, itemSchema }) {
  if (!itemSchema) {
    return (
      <InlineWordDiff
        prev={stableStringify(prev)}
        next={stableStringify(next)}
      />
    );
  }
  const changedKeys = Object.keys(itemSchema).filter(
    (k) => stableStringify(prev[k]) !== stableStringify(next[k]),
  );
  if (changedKeys.length === 0) return null;
  return (
    <div style={fieldStackStyle}>
      {changedKeys.map((fieldKey) => {
        const field = itemSchema[fieldKey];
        return (
          <FieldLabeled key={fieldKey} label={fieldKey}>
            <DiffContent
              blockType={field.blockType}
              prev={prev[fieldKey]}
              next={next[fieldKey]}
            />
          </FieldLabeled>
        );
      })}
    </div>
  );
}

/**
 * Render a single value (no diff) tinted in `tone`, for fully added/removed
 * list items where there's no other side to compare against.
 *
 * @param {{ blockType: BlockType | string, value: *, tone: string }} props
 */
function SoloValue({ blockType, value, tone }) {
  const wrap = tone === DIFF_REMOVED ? removedSpanStyle
    : tone === DIFF_ADDED ? addedSpanStyle
    : neutralSpanStyle;
  if (value == null || value === "") {
    return <span style={emptyValueStyle}>—</span>;
  }
  switch (blockType) {
    case "ShortText":
    case "LongText":
    case "Date":
      return <span style={wrap}>{String(value)}</span>;
    case "RichText":
      return <span style={wrap}>{stripHtml(value)}</span>;
    case "Link": {
      const label = value?.label ?? "";
      const href = value?.href ?? "";
      return <span style={wrap}>{label || href}{label && href ? ` (${href})` : ""}</span>;
    }
    case "Image": {
      const src = value?.src;
      if (!src) return <span style={emptyValueStyle}>—</span>;
      return <img src={src} alt={value?.alt ?? ""} style={imageThumbStyle} />;
    }
    default:
      return <span style={{ ...wrap, fontFamily: FONT_MONO, fontSize: 11 }}>{stableStringify(value)}</span>;
  }
}

/**
 * @param {{ label: string, children: React.ReactNode }} props
 */
function FieldLabeled({ label, children }) {
  return (
    <div style={fieldRowStyle}>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

// ---- Styles --------------------------------------------------------------

const scrollStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
});

const collectionDraftCountStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  fontSize: 10,
  letterSpacing: "0.04em",
  color: COLLECTION_ACCENT,
  padding: "1px 6px",
  border: `1px solid ${COLLECTION_LINE}`,
  borderRadius: 3,
  opacity: 0.85,
});

const diffBoxStyle = /** @type {React.CSSProperties} */ ({
  background: SURFACE_1,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: RADIUS_SM,
  padding: "8px 10px",
});

const lineDiffWrapStyle = /** @type {React.CSSProperties} */ ({
  border: `1px solid ${HAIRLINE}`,
  borderRadius: RADIUS_SM,
  background: SURFACE_1,
  overflow: "hidden",
  fontFamily: FONT_MONO,
  fontSize: 11.5,
  lineHeight: 1.6,
});

// No line-number gutters: a "line" here is a paragraph of prose, and the editor
// the author works in never numbers them, so the columns carried no meaning.
const lineRowBase = /** @type {React.CSSProperties} */ ({
  display: "grid",
  gridTemplateColumns: "16px 1fr",
  alignItems: "baseline",
  paddingRight: 8,
});

const lineUnchangedStyle = /** @type {React.CSSProperties} */ ({
  background: "transparent",
  color: TEXT_MUTED,
});

const lineAddedStyle = /** @type {React.CSSProperties} */ ({
  background: `color-mix(in srgb, ${DIFF_ADDED} 10%, transparent)`,
  color: TEXT,
});

const lineRemovedStyle = /** @type {React.CSSProperties} */ ({
  background: `color-mix(in srgb, ${DIFF_REMOVED} 10%, transparent)`,
  color: TEXT,
});

const lineGutterStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textAlign: "center",
  userSelect: "none",
});

const lineTextStyle = /** @type {React.CSSProperties} */ ({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const lineHunkStyle = /** @type {React.CSSProperties} */ ({
  padding: "3px 12px",
  background: "rgba(255,255,255,0.03)",
  borderTop: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
  color: TEXT_FAINT,
  fontSize: 10,
  letterSpacing: "0.04em",
  textAlign: "center",
});

const pairedRemovedSpanStyle = /** @type {React.CSSProperties} */ ({
  background: `color-mix(in srgb, ${DIFF_REMOVED} 30%, transparent)`,
  color: DIFF_REMOVED,
  borderRadius: 2,
});

const pairedAddedSpanStyle = /** @type {React.CSSProperties} */ ({
  background: `color-mix(in srgb, ${DIFF_ADDED} 30%, transparent)`,
  color: DIFF_ADDED,
  borderRadius: 2,
});

const inlineDiffStyle = /** @type {React.CSSProperties} */ ({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: TEXT,
  fontSize: 12,
  lineHeight: 1.55,
});

const collapsedSpanStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-block",
  margin: "0 2px",
  padding: "0 6px",
  borderRadius: 3,
  background: "rgba(255,255,255,0.04)",
  color: TEXT_FAINT,
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: "0.04em",
  verticalAlign: "middle",
});

// Elision pill for LineDiff rows. Aliased to `collapsedSpanStyle` but kept
// separate so a future tweak to one surface doesn't drag the other.
const collapsedInlineStyle = collapsedSpanStyle;

const goToButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  background: "transparent",
  border: 0,
  borderRadius: 4,
  color: TEXT_MUTED,
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
});

const unchangedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
});

const removedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: DIFF_REMOVED,
  background: `color-mix(in srgb, ${DIFF_REMOVED} 14%, transparent)`,
  textDecoration: "line-through",
  textDecorationColor: `color-mix(in srgb, ${DIFF_REMOVED} 50%, transparent)`,
  padding: "0 2px",
  borderRadius: 2,
});

// Used when a row reports movement rather than a content change: nothing was
// added or removed, so the value is shown plainly.
const neutralSpanStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT,
  padding: "0 2px",
});

const addedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: DIFF_ADDED,
  background: `color-mix(in srgb, ${DIFF_ADDED} 14%, transparent)`,
  padding: "0 2px",
  borderRadius: 2,
});

const arrowDiffStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  flexWrap: "wrap",
});

const arrowStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontFamily: FONT_MONO,
});

const imageRowStyle = /** @type {React.CSSProperties} */ ({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
});

/** @param {string} tone */
// Neutral on both sides: swapping a picture is neither an addition nor a
// deletion, so the red/green diff palette misdescribed it. Which side is the
// proposal is carried by the caption's weight instead of by a colour.
const imageSideStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const imageLabelStyle = /** @type {React.CSSProperties} */ ({
  font: `500 10.5px/1 ${FONT_SANS}`,
  color: TEXT_MUTED,
});

const imageLabelNextStyle = /** @type {React.CSSProperties} */ ({
  font: `600 10.5px/1 ${FONT_SANS}`,
  color: TEXT,
});

const imageThumbStyle = /** @type {React.CSSProperties} */ ({
  width: "100%",
  height: 104,
  objectFit: "contain",
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  borderRadius: R_SM,
  // A drawer surface rather than pure black: the thumbnail is a panel element,
  // not a lightbox, and a hard black plate fought everything around it.
  background: SURFACE_1,
});

const emptyValueStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
  fontSize: 12,
  fontStyle: "italic",
});

/** @param {"added"|"removed"|"changed"} kind */
function listItemRowStyle(kind) {
  /** @type {React.CSSProperties} */
  const base = {
    border: `1px solid ${HAIRLINE}`,
    borderRadius: RADIUS_SM,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };
  if (kind === "added") return { ...base, background: `color-mix(in srgb, ${DIFF_ADDED} 10%, transparent)` };
  if (kind === "removed") return { ...base, background: `color-mix(in srgb, ${DIFF_REMOVED} 10%, transparent)` };
  return { ...base, background: SURFACE_1 };
}

const listItemHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: TEXT_MUTED,
});

/** @param {"added"|"removed"|"changed"} kind */
function listItemGlyphStyle(kind) {
  const tone = toneForKind(kind);
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: 600,
    color: tone,
    width: 14,
    textAlign: "center",
    display: "inline-block",
  });
}

/** @param {string} tone */
function listItemBadgeStyle() {
  return /** @type {React.CSSProperties} */ ({
    font: `400 11px/1 ${FONT_SANS}`,
    color: TEXT_MUTED,
  });
}

const fieldStackStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const fieldRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const fieldLabelStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: "0.04em",
  color: TEXT_MUTED,
});

/** @param {string} tone */
function fallbackJsonStyle(tone) {
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: tone === DIFF_ADDED || tone === DIFF_REMOVED ? tone : TEXT,
    background: tone === DIFF_ADDED || tone === DIFF_REMOVED
      ? `color-mix(in srgb, ${tone} 10%, transparent)`
      : SURFACE_1,
    padding: "6px 8px",
    borderRadius: RADIUS_SM,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  });
}
