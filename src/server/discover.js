/**
 * @file Manifest discovery - AST-walk a Next.js app/ tree and produce a
 * `SyncManifestRequest[]` from `<EditableRegion>` JSX and `useCmsBlock`
 * call sites. Same shape the legacy hand-written `cms.manifest.mjs` had.
 *
 * SERVER ONLY - exposed via `@skylab/cms/server` and used by the
 * `cms-sync` CLI. Not safe to import from a client component (pulls in
 * Babel at runtime).
 *
 * Discovery rules:
 *
 *   - Every `withCms("/slug", X)` call is the root of one slug. The file
 *     containing the call is the entry point; reachable files are followed
 *     via relative imports (DFS pre-order). Bare specifiers (`@skylab/cms`,
 *     `next/...`) are not followed.
 *
 *   - Within reachable files, every `<EditableRegion blockPath blockType
 *     defaultValue ...>` JSX element contributes one ManifestBlockItem.
 *     `useCmsBlock("path", { blockType, defaultValue })` does the same for
 *     read-only blocks that never render through `<EditableRegion>`.
 *
 *   - `sortOrder` is the DFS order (root file first, then imports in source
 *     order). Duplicate blockPaths within a slug: first occurrence wins.
 *
 *   - Shared component reachable from two slugs contributes its regions
 *     to both - by design (each slug owns its own DB rows).
 *
 *   - Props must be static literals. Anything the analyzer can't evaluate
 *     (variables, function calls, spread) yields a warning and the region
 *     is skipped (no DB row -> renders as empty placeholder forever).
 */

import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

// @babel/traverse is published as CommonJS; the ESM default-export shape
// flips between bundlers, so coalesce both possibilities.
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;

/**
 * @import { SyncManifestRequest, ManifestBlockItem, BlockType } from "../lib/schemas.js"
 */

const SOURCE_EXTENSIONS = [".jsx", ".js", ".tsx", ".ts"];
const INDEX_FILES = SOURCE_EXTENSIONS.map((ext) => `index${ext}`);

const PARSER_OPTIONS = {
  sourceType: "module",
  plugins: ["jsx", "typescript", "topLevelAwait"],
};

const UNRESOLVED = Symbol("unresolved");

/**
 * @typedef {Object} DiscoveredRegion
 * @property {string} blockPath
 * @property {BlockType} blockType
 * @property {*} defaultValue
 * @property {import("../lib/schemas.js").ItemSchema} [itemSchema]  List blocks only.
 */

/**
 * @typedef {Object} FileAnalysis
 * @property {string} file
 * @property {string[]} imports
 * @property {string[]} withCmsSlugs
 * @property {DiscoveredRegion[]} regions
 */

/**
 * @typedef {Object} DiscoveryWarning
 * @property {string} file
 * @property {{ line: number, column: number } | null} loc
 * @property {string} message
 */

/**
 * @typedef {Object} DiscoveryResult
 * @property {SyncManifestRequest[]} manifests
 * @property {DiscoveryWarning[]} warnings
 */

/**
 * @typedef {Object} DiscoverManifestsOptions
 * @property {string} [appRoot]   Directory to scan. Default: `process.cwd()/app`.
 */

/**
 * @param {DiscoverManifestsOptions} [options]
 * @returns {Promise<DiscoveryResult>}
 */
export async function discoverManifests(options = {}) {
  const appRoot = options.appRoot ?? path.resolve(process.cwd(), "app");

  const files = await collectSourceFiles(appRoot);
  /** @type {Map<string, FileAnalysis>} */
  const analyses = new Map();
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  for (const file of files) {
    const { analysis, warnings: fileWarnings } = await analyzeFile(file);
    analyses.set(file, analysis);
    warnings.push(...fileWarnings);
  }

  /** @type {Map<string, Map<string, ManifestBlockItem>>} */
  const bySlug = new Map();

  for (const [rootFile, analysis] of analyses) {
    if (analysis.withCmsSlugs.length === 0) continue;
    for (const slug of analysis.withCmsSlugs) {
      const blockMap = bySlug.get(slug) ?? new Map();
      bySlug.set(slug, blockMap);

      /** @type {DiscoveredRegion[]} */
      const ordered = [];
      collectRegionsDfs(rootFile, analyses, new Set(), ordered);

      let nextSortOrder = blockMap.size + 1;
      for (const region of ordered) {
        if (blockMap.has(region.blockPath)) continue;
        /** @type {ManifestBlockItem} */
        const entry = {
          blockPath: region.blockPath,
          blockType: region.blockType,
          defaultValue: region.defaultValue,
          sortOrder: nextSortOrder++,
        };
        if (region.itemSchema) entry.itemSchema = region.itemSchema;
        blockMap.set(region.blockPath, entry);
      }
    }
  }

  /** @type {SyncManifestRequest[]} */
  const manifests = [];
  for (const [slug, blockMap] of bySlug) {
    manifests.push({ slug, blocks: [...blockMap.values()] });
  }
  manifests.sort((a, b) => a.slug.localeCompare(b.slug));

  return { manifests, warnings };
}

/**
 * DFS pre-order: emit the current file's regions, then recurse into each
 * relative import in source order. `visited` prevents cycles and double
 * counting when a shared component is imported by both branches of the
 * graph reachable from a single slug.
 *
 * @param {string} file
 * @param {Map<string, FileAnalysis>} analyses
 * @param {Set<string>} visited
 * @param {DiscoveredRegion[]} out
 */
function collectRegionsDfs(file, analyses, visited, out) {
  if (visited.has(file)) return;
  visited.add(file);
  const analysis = analyses.get(file);
  if (!analysis) return;
  for (const region of analysis.regions) out.push(region);
  for (const imp of analysis.imports) collectRegionsDfs(imp, analyses, visited, out);
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await collectSourceFiles(full)));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} fromFile
 * @param {string} spec
 * @returns {string | null}
 */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);

  if (existsSync(base) && isFile(base)) return base;
  for (const ext of SOURCE_EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (isDirectory(base)) {
    for (const idx of INDEX_FILES) {
      const candidate = path.join(base, idx);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** @param {string} p */
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/** @param {string} p */
function isDirectory(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/**
 * @param {string} filePath
 * @returns {Promise<{ analysis: FileAnalysis, warnings: DiscoveryWarning[] }>}
 */
async function analyzeFile(filePath) {
  const source = await readFile(filePath, "utf8");

  let ast;
  try {
    ast = parse(source, PARSER_OPTIONS);
  } catch (err) {
    throw new Error(
      `[cms-discover] Failed to parse ${path.relative(process.cwd(), filePath)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  /** @type {FileAnalysis} */
  const analysis = {
    file: filePath,
    imports: [],
    withCmsSlugs: [],
    regions: [],
  };
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  traverse(ast, {
    ImportDeclaration(p) {
      const resolved = resolveImport(filePath, p.node.source.value);
      if (resolved) analysis.imports.push(resolved);
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== "Identifier") return;

      if (callee.name === "withCms") {
        const slug = literalString(p.node.arguments[0]);
        if (slug == null) {
          warnings.push({
            file: filePath,
            loc: locOf(p.node),
            message:
              "withCms() called with a non-literal slug - skipping. Pass a string literal so the manifest discovery can statically resolve it.",
          });
          return;
        }
        analysis.withCmsSlugs.push(slug);
        return;
      }

      // useCmsBlock("path", { blockType, defaultValue }) - read-only block
      // declaration. The 2nd arg is metadata; without it we can't register
      // the block, so the call is treated as a pure read and ignored.
      if (callee.name === "useCmsBlock") {
        const blockPath = literalString(p.node.arguments[0]);
        if (blockPath == null) return;
        const metaNode = p.node.arguments[1];
        if (!metaNode) return;
        const meta = evalLiteral(metaNode);
        if (meta === UNRESOLVED || meta === null || typeof meta !== "object") {
          warnings.push({
            file: filePath,
            loc: locOf(p.node),
            message: `useCmsBlock("${blockPath}", ...) metadata must be a static object literal. Skipping.`,
          });
          return;
        }
        if (typeof meta.blockType !== "string" || !("defaultValue" in meta)) {
          warnings.push({
            file: filePath,
            loc: locOf(p.node),
            message: `useCmsBlock("${blockPath}", ...) metadata is missing blockType or defaultValue. Skipping.`,
          });
          return;
        }
        analysis.regions.push({
          blockPath,
          blockType: /** @type {BlockType} */ (meta.blockType),
          defaultValue: meta.defaultValue,
        });
        return;
      }
    },
    JSXOpeningElement(p) {
      const name = p.node.name;
      if (name.type !== "JSXIdentifier") return;

      if (name.name === "EditableRegion") {
        handleEditableRegion(p.node, filePath, analysis, warnings);
        return;
      }
      if (name.name === "EditableList") {
        handleEditableList(p.node, filePath, analysis, warnings);
        return;
      }
    },
  });

  return { analysis, warnings };
}

/**
 * Pull a static `<EditableRegion>` declaration into the file analysis.
 * Required props: blockPath, blockType, defaultValue. Anything missing
 * yields a warning and the region is skipped.
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 */
function handleEditableRegion(openingNode, filePath, analysis, warnings) {
  const props = readJsxProps(openingNode);
  const blockPath = props.blockPath;
  const blockType = props.blockType;
  const hasDefault = Object.prototype.hasOwnProperty.call(props, "defaultValue");

  if (typeof blockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message:
        "<EditableRegion> needs a static blockPath string. Skipping discovery for this region.",
    });
    return;
  }
  if (typeof blockType !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message: `<EditableRegion blockPath="${blockPath}"> is missing a static blockType prop. Skipping.`,
    });
    return;
  }
  if (!hasDefault) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message: `<EditableRegion blockPath="${blockPath}"> is missing a static defaultValue prop. Skipping.`,
    });
    return;
  }

  analysis.regions.push({
    blockPath,
    blockType: /** @type {BlockType} */ (blockType),
    defaultValue: props.defaultValue,
  });
}

/**
 * Pull a static `<EditableList>` declaration into the file analysis.
 * Required props: blockPath, itemSchema. `defaultValue` is optional and
 * defaults to `[]` (empty list) - lists usually start empty.
 *
 * The itemSchema must be a plain object literal. Each value is itself a
 * `{ blockType, defaultValue }` literal pair; that's the manifest's
 * `ItemSchema` shape, validated structurally below.
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 */
function handleEditableList(openingNode, filePath, analysis, warnings) {
  const props = readJsxProps(openingNode);
  const blockPath = props.blockPath;
  const itemSchema = props.itemSchema;

  if (typeof blockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message:
        "<EditableList> needs a static blockPath string. Skipping discovery for this list.",
    });
    return;
  }
  if (!isValidItemSchema(itemSchema)) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message: `<EditableList blockPath="${blockPath}"> is missing or has a non-static itemSchema. Each field must be a plain object with literal blockType + defaultValue.`,
    });
    return;
  }

  const defaultValue = Object.prototype.hasOwnProperty.call(props, "defaultValue")
    ? props.defaultValue
    : [];

  if (!Array.isArray(defaultValue)) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode),
      message: `<EditableList blockPath="${blockPath}"> defaultValue must be an array. Skipping.`,
    });
    return;
  }

  analysis.regions.push({
    blockPath,
    blockType: /** @type {BlockType} */ ("List"),
    defaultValue,
    itemSchema,
  });
}

/**
 * Structural check that `value` looks like an `ItemSchema`: a plain
 * object whose values are `{ blockType: string, defaultValue: * }`.
 *
 * @param {*} value
 */
function isValidItemSchema(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  for (const field of Object.values(value)) {
    if (field == null || typeof field !== "object" || Array.isArray(field)) return false;
    if (typeof field.blockType !== "string") return false;
    if (!Object.prototype.hasOwnProperty.call(field, "defaultValue")) return false;
  }
  return true;
}

/**
 * @param {*} node
 * @returns {string | null}
 */
function literalString(node) {
  if (node && node.type === "StringLiteral") return node.value;
  return null;
}

/**
 * @param {*} opening
 */
function readJsxProps(opening) {
  /** @type {Record<string, *>} */
  const props = {};
  for (const attr of opening.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier") continue;
    const value = readJsxAttrValue(attr.value);
    if (value === UNRESOLVED) continue;
    props[attr.name.name] = value;
  }
  return props;
}

/**
 * @param {*} node
 */
function readJsxAttrValue(node) {
  if (node == null) return true;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "JSXExpressionContainer") return evalLiteral(node.expression);
  return UNRESOLVED;
}

/**
 * @param {*} node
 * @returns {* | typeof UNRESOLVED}
 */
function evalLiteral(node) {
  if (!node) return UNRESOLVED;
  switch (node.type) {
    case "StringLiteral":  return node.value;
    case "NumericLiteral": return node.value;
    case "BooleanLiteral": return node.value;
    case "NullLiteral":    return null;
    case "TemplateLiteral":
      if (node.expressions.length === 0) return node.quasis[0].value.cooked;
      return UNRESOLVED;
    case "UnaryExpression": {
      if (node.operator !== "-") return UNRESOLVED;
      const inner = evalLiteral(node.argument);
      return typeof inner === "number" ? -inner : UNRESOLVED;
    }
    case "ObjectExpression": {
      /** @type {Record<string, *>} */
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== "ObjectProperty") return UNRESOLVED;
        const key =
          prop.key.type === "Identifier"   ? prop.key.name :
          prop.key.type === "StringLiteral" ? prop.key.value :
          null;
        if (key == null) return UNRESOLVED;
        const value = evalLiteral(prop.value);
        if (value === UNRESOLVED) return UNRESOLVED;
        obj[key] = value;
      }
      return obj;
    }
    case "ArrayExpression": {
      const arr = [];
      for (const el of node.elements) {
        if (el == null) return UNRESOLVED;
        const value = evalLiteral(el);
        if (value === UNRESOLVED) return UNRESOLVED;
        arr.push(value);
      }
      return arr;
    }
    default:
      return UNRESOLVED;
  }
}

/**
 * @param {*} node
 * @returns {{ line: number, column: number } | null}
 */
function locOf(node) {
  if (!node || !node.loc) return null;
  return { line: node.loc.start.line, column: node.loc.start.column };
}
