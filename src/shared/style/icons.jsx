/**
 * @file Local, dependency-free Lucide icons. SVG node data is copied verbatim
 * from lucide-react v1.14.0 (ISC-licensed, https://lucide.dev); `Icon` mirrors
 * lucide's wrapper (24x24 viewBox, `currentColor` stroke, same props) so call
 * sites behave identically.
 *
 * To add one: copy its `__iconNode` array from the lucide-react package and
 * add an export.
 *
 * The block-type badges at the bottom are our own drawings in the same
 * grammar; lucide's 24px-grid detail breaks up at the 12px they render at.
 */

import { createElement, forwardRef } from "react";

const baseAttrs = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function createIcon(name, nodes) {
  const Component = forwardRef(function LucideIcon(
    {
      size = 24,
      color,
      strokeWidth = 2,
      absoluteStrokeWidth = false,
      className = "",
      children,
      ...rest
    },
    ref,
  ) {
    const sw = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;
    return createElement(
      "svg",
      {
        ref,
        ...baseAttrs,
        width: size,
        height: size,
        stroke: color ?? baseAttrs.stroke,
        strokeWidth: sw,
        className: `lucide lucide-${name}${className ? ` ${className}` : ""}`,
        "aria-hidden": children ? undefined : "true",
        ...rest,
      },
      ...nodes.map(([tag, attrs]) => createElement(tag, attrs)),
      children,
    );
  });
  Component.displayName = name;
  return Component;
}

export const ChevronDown = createIcon("chevron-down", [
  ["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }],
]);

export const ChevronUp = createIcon("chevron-up", [
  ["path", { d: "m18 15-6-6-6 6", key: "153udz" }],
]);

export const ChevronLeft = createIcon("chevron-left", [
  ["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }],
]);

export const ChevronRight = createIcon("chevron-right", [
  ["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }],
]);

export const GripVertical = createIcon("grip-vertical", [
  ["circle", { cx: "9", cy: "5", r: "1", key: "grip-l1" }],
  ["circle", { cx: "9", cy: "12", r: "1", key: "grip-l2" }],
  ["circle", { cx: "9", cy: "19", r: "1", key: "grip-l3" }],
  ["circle", { cx: "15", cy: "5", r: "1", key: "grip-r1" }],
  ["circle", { cx: "15", cy: "12", r: "1", key: "grip-r2" }],
  ["circle", { cx: "15", cy: "19", r: "1", key: "grip-r3" }],
]);

export const ChevronsLeft = createIcon("chevrons-left", [
  ["path", { d: "m11 17-5-5 5-5", key: "13zhaf" }],
  ["path", { d: "m18 17-5-5 5-5", key: "h8a8et" }],
]);

export const Check = createIcon("check", [
  ["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }],
]);

export const ArrowUp = createIcon("arrow-up", [
  ["path", { d: "m5 12 7-7 7 7", key: "hav0vg" }],
  ["path", { d: "M12 19V5", key: "x0mq9r" }],
]);

export const ArrowDown = createIcon("arrow-down", [
  ["path", { d: "M12 5v14", key: "s699le" }],
  ["path", { d: "m19 12-7 7-7-7", key: "1idqje" }],
]);

export const Archive = createIcon("archive", [
  ["rect", { width: "20", height: "5", x: "2", y: "3", rx: "1", key: "1wp1u1" }],
  ["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8", key: "1s80jp" }],
  ["path", { d: "M10 12h4", key: "a56b0p" }],
]);

export const ArchiveRestore = createIcon("archive-restore", [
  ["rect", { width: "20", height: "5", x: "2", y: "3", rx: "1", key: "1wp1u1" }],
  ["path", { d: "M4 8v11a2 2 0 0 0 2 2h2", key: "tvwodi" }],
  ["path", { d: "M20 8v11a2 2 0 0 1-2 2h-2", key: "1gkqxj" }],
  ["path", { d: "m9 15 3-3 3 3", key: "1pd0qc" }],
  ["path", { d: "M12 12v9", key: "192myk" }],
]);

export const Undo2 = createIcon("undo-2", [
  ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
  ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11", key: "f3b9sd" }],
]);

export const Redo2 = createIcon("redo-2", [
  ["path", { d: "m15 14 5-5-5-5", key: "12vg1m" }],
  ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13", key: "6uklza" }],
]);

export const Lock = createIcon("lock", [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }],
]);

export const Pencil = createIcon("pencil", [
  ["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", key: "1a8usu" }],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }],
]);

export const LogOut = createIcon("log-out", [
  ["path", { d: "m16 17 5-5-5-5", key: "1bji2h" }],
  ["path", { d: "M21 12H9", key: "dn1m92" }],
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", key: "1uf3rs" }],
]);

export const Search = createIcon("search", [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
]);

export const Eye = createIcon("eye", [
  ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", key: "1nclc0" }],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }],
]);

export const Plus = createIcon("plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }],
]);

export const Image = createIcon("image", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }],
]);

export const Upload = createIcon("upload", [
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["polyline", { points: "17 8 12 3 7 8", key: "t8dd8p" }],
  ["line", { x1: "12", x2: "12", y1: "3", y2: "15", key: "widbto" }],
]);

export const FileText = createIcon("file-text", [
  ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", key: "1rqfz7" }],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }],
]);

export const Folder = createIcon("folder", [
  ["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z", key: "1kt360" }],
]);

export const Layers = createIcon("layers", [
  ["path", { d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", key: "8b97xw" }],
  ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", key: "1b0tmp" }],
  ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65", key: "13ksps" }],
]);

export const Trash2 = createIcon("trash-2", [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }],
]);

export const Bold = createIcon("bold", [
  ["path", { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8", key: "mg9rjx" }],
]);

export const Italic = createIcon("italic", [
  ["line", { x1: "19", x2: "10", y1: "4", y2: "4", key: "15jd3p" }],
  ["line", { x1: "14", x2: "5", y1: "20", y2: "20", key: "bu0au3" }],
  ["line", { x1: "15", x2: "9", y1: "4", y2: "20", key: "uljnxc" }],
]);

export const Strikethrough = createIcon("strikethrough", [
  ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4", key: "43sutm" }],
  ["path", { d: "M14 12a4 4 0 0 1 0 8H6", key: "nlfj13" }],
  ["line", { x1: "4", x2: "20", y1: "12", y2: "12", key: "1e0a9i" }],
]);

export const Heading2 = createIcon("heading-2", [
  ["path", { d: "M4 12h8", key: "17cfdx" }],
  ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ["path", { d: "M12 18V6", key: "zqpxq5" }],
  ["path", { d: "M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1", key: "9jr5yi" }],
]);

export const Heading3 = createIcon("heading-3", [
  ["path", { d: "M4 12h8", key: "17cfdx" }],
  ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ["path", { d: "M12 18V6", key: "zqpxq5" }],
  ["path", { d: "M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2", key: "68ncm8" }],
  ["path", { d: "M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2", key: "1ejuhz" }],
]);

export const List = createIcon("list", [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }],
]);

export const ListOrdered = createIcon("list-ordered", [
  ["path", { d: "M11 5h10", key: "1cz7ny" }],
  ["path", { d: "M11 12h10", key: "1438ji" }],
  ["path", { d: "M11 19h10", key: "11t30w" }],
  ["path", { d: "M4 4h1v5", key: "10yrso" }],
  ["path", { d: "M4 9h2", key: "r1h2o0" }],
  ["path", { d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02", key: "xtkcd5" }],
]);

export const Quote = createIcon("quote", [
  ["path", { d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z", key: "rib7q0" }],
  ["path", { d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z", key: "1ymkrd" }],
]);

export const Code = createIcon("code", [
  ["path", { d: "m16 18 6-6-6-6", key: "eg8j8" }],
  ["path", { d: "m8 6-6 6 6 6", key: "ppft3o" }],
]);

export const GitMerge = createIcon("git-merge", [
  ["circle", { cx: "18", cy: "18", r: "3", key: "1xkwt0" }],
  ["circle", { cx: "6", cy: "6", r: "3", key: "1lh9wr" }],
  ["path", { d: "M6 21V9a9 9 0 0 0 9 9", key: "7kw0sc" }],
]);

export const Languages = createIcon("languages", [
  ["path", { d: "m5 8 6 6", key: "1wu5hv" }],
  ["path", { d: "m4 14 6-6 2-3", key: "1k1g8d" }],
  ["path", { d: "M2 5h12", key: "or177f" }],
  ["path", { d: "M7 2h1", key: "1t2jsx" }],
  ["path", { d: "m22 22-5-10-5 10", key: "don7ne" }],
  ["path", { d: "M14 18h6", key: "1m8k6r" }],
]);

export const Link = createIcon("link", [
  ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", key: "1cjeqo" }],
  ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71", key: "19qd67" }],
]);

// ---------------------------------------------------------------------------
// Block-type badges
//
// One family, separating by shape rather than by letter ("Aa" and "≡a" were the
// old glyphs, and a letterform is what stops reading as an icon). Two rules
// hold the set together at badge size: every coordinate is even, so each stroke
// lands on a whole pixel at 12px, and the stroke stays at the default 2, which
// is exactly 1px there. Thinning it puts the edge on a half pixel.
//
// Image is the exception: it borrows lucide's own drawing above, so it sits off
// that grid.
// ---------------------------------------------------------------------------

export const TypeShortText = createIcon("type-short-text", [
  ["path", { d: "M6 9h12", key: "short-1" }],
  ["path", { d: "M6 15h6", key: "short-2" }],
]);

export const TypeLongText = createIcon("type-long-text", [
  ["path", { d: "M4 6h16", key: "long-1" }],
  ["path", { d: "M4 12h16", key: "long-2" }],
  ["path", { d: "M4 18h10", key: "long-3" }],
]);

// The paragraph again, behind a rule: text that carries formatting. Same 6/12/18
// grid, so the rule spans the lines exactly rather than overhanging them.
export const TypeRichText = createIcon("type-rich-text", [
  ["path", { d: "M4 6v12", key: "rich-rule" }],
  ["path", { d: "M10 6h10", key: "rich-1" }],
  ["path", { d: "M10 12h10", key: "rich-2" }],
  ["path", { d: "M10 18h6", key: "rich-3" }],
]);

export const TypeLink = createIcon("type-link", [
  ["path", { d: "M10 6H8a4 4 0 0 0 0 8h2", key: "link-left" }],
  ["path", { d: "M14 6h2a4 4 0 0 1 0 8h-2", key: "link-right" }],
  ["path", { d: "M8 10h8", key: "link-bar" }],
]);

export const TypeDate = createIcon("type-date", [
  ["rect", { width: "16", height: "14", x: "4", y: "6", rx: "2", key: "date-frame" }],
  ["path", { d: "M8 4v4", key: "date-tab-left" }],
  ["path", { d: "M16 4v4", key: "date-tab-right" }],
  ["path", { d: "M4 12h16", key: "date-rule" }],
]);

export const TypeList = createIcon("type-list", [
  ["path", { d: "M8 6h12", key: "list-1" }],
  ["path", { d: "M8 12h12", key: "list-2" }],
  ["path", { d: "M8 18h12", key: "list-3" }],
  ["path", { d: "M4 6h.01", key: "list-dot-1" }],
  ["path", { d: "M4 12h.01", key: "list-dot-2" }],
  ["path", { d: "M4 18h.01", key: "list-dot-3" }],
]);

export const TypeCollection = createIcon("type-collection", [
  ["path", { d: "M8 4h10a2 2 0 0 1 2 2v10", key: "collection-back" }],
  ["rect", { width: "12", height: "12", x: "4", y: "8", rx: "2", key: "collection-front" }],
]);

// Not a block type: the CmsGroup label. Four corners, which is the dashed frame
// the group draws around its children, reduced to a badge.
export const TypeGroup = createIcon("type-group", [
  ["path", { d: "M4 8V6a2 2 0 0 1 2-2h2", key: "group-tl" }],
  ["path", { d: "M16 4h2a2 2 0 0 1 2 2v2", key: "group-tr" }],
  ["path", { d: "M20 16v2a2 2 0 0 1-2 2h-2", key: "group-br" }],
  ["path", { d: "M8 20H6a2 2 0 0 1-2-2v-2", key: "group-bl" }],
]);

export const TypeUnknown = createIcon("type-unknown", [
  ["rect", { width: "16", height: "16", x: "4", y: "4", rx: "2", key: "unknown-frame" }],
  ["path", { d: "M12 12h.01", key: "unknown-dot" }],
]);

/** @type {Record<string, typeof TypeShortText>} */
const TYPE_ICONS = {
  ShortText: TypeShortText,
  // "Text" predates the Short/Long split and still reaches renderBlock, so it
  // takes the paragraph instead of falling through to the unknown frame.
  Text: TypeLongText,
  LongText: TypeLongText,
  RichText: TypeRichText,
  Image,
  Link: TypeLink,
  Date: TypeDate,
  List: TypeList,
  Collection: TypeCollection,
};

/**
 * Falls back to the empty frame rather than throwing: an older SDK against a
 * newer backend still has to render the row.
 *
 * @param {string | null | undefined} blockType
 */
export function typeIconFor(blockType) {
  return TYPE_ICONS[/** @type {string} */ (blockType)] ?? TypeUnknown;
}
