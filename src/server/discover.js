/**
 * @file Manifest discovery: AST-walk a Next.js app/ tree and build a
 * `SyncManifestRequest[]` from `<EditableRegion>` JSX and `useCmsBlock` calls.
 *
 * Server-only, consumed by the `cms-sync` CLI (not exported from any package
 * entry); pulls in the native `oxc-parser`, so never import it from a client
 * component.
 *
 * Discovery rules:
 *
 *   - Every `withCms("/slug", X)` call is the root of one slug. The file
 *     containing the call is the entry point; reachable files are followed
 *     via relative imports and jsconfig/tsconfig `paths` aliases (DFS
 *     pre-order), including files outside the scanned app root. Bare
 *     specifiers (`inscribed`, `next/...`) are not followed; an alias that
 *     matches no `paths` entry warns instead of silently dropping the file.
 *
 *   - Files that fail to parse are skipped with a warning rather than
 *     aborting the run, so one broken (or oxc-unsupported) file can't kill
 *     the whole sync. Their regions are missing from that run.
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

import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parseSync } from "oxc-parser";

/**
 * @import { SyncManifestRequest, ManifestBlockItem, BlockType } from "../lib/schemas.js"
 */

const SOURCE_EXTENSIONS = [".jsx", ".js", ".tsx", ".ts"];
const INDEX_FILES = SOURCE_EXTENSIONS.map((ext) => `index${ext}`);

// oxc infers the dialect from `lang`. `.ts` stays TypeScript-only so
// angle-bracket type assertions parse correctly; every other extension allows
// JSX, matching Next.js where `.js` files routinely contain JSX.
/** @type {Record<string, "jsx" | "tsx" | "ts">} */
const LANG_BY_EXT = {
  ".jsx": "jsx",
  ".js": "jsx",
  ".tsx": "tsx",
  ".ts": "ts",
};

const UNRESOLVED = Symbol("unresolved");

/**
 * @typedef {Object} DiscoveredRegion
 * @property {string} blockPath
 * @property {BlockType} blockType
 * @property {*} defaultValue
 * @property {import("../lib/schemas.js").ItemSchema} [itemSchema]  List blocks only.
 * @property {string} [scope]
 *   Discovery scope marker. When `"global"`, the region is written to the
 *   `globalSlug` manifest entry instead of any page slug, so a header/footer
 *   declared once is shared across every page. Undefined = page-scoped (the
 *   region follows the withCms slug it's reachable from).
 */

/**
 * @typedef {Object} FileAnalysis
 * @property {string} file
 * @property {string[]} imports
 * @property {Map<string, string>} importBindings
 *   Imported local name -> resolved file, for the cross-file group check.
 * @property {string[]} withCmsSlugs
 * @property {DiscoveredRegion[]} regions
 * @property {{ componentName: string, file: string, prefix: string, loc: { line: number, column: number } | null }[]} groupComponentRefs
 *   Imported components rendered inside a `<CmsGroup>`. Resolved into
 *   warnings after every file is analyzed, when it's known whether the
 *   component's graph declares regions.
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
 * @property {string} [appRoot]      Directory to scan. Default: `process.cwd()/app`.
 * @property {string} [globalSlug]   Slug to receive `scope="global"` regions. Default: `"__global"`.
 */

/**
 * @param {DiscoverManifestsOptions} [options]
 * @returns {Promise<DiscoveryResult>}
 */
export async function discoverManifests(options = {}) {
  const appRoot = options.appRoot ?? path.resolve(process.cwd(), "app");
  const globalSlug = options.globalSlug ?? "__global";

  const files = await collectSourceFiles(appRoot);
  const aliases = loadPathAliases(appRoot);
  /** @type {Map<string, FileAnalysis>} */
  const analyses = new Map();
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  // Demand-driven analysis: start from the files under appRoot, then pull in
  // every reachable source file an import resolves to, even outside appRoot
  // (a root-level components/ dir is common in Next.js apps). Non-source
  // imports (css, json) and anything under node_modules are skipped.
  const queue = [...files];
  const queued = new Set(queue);
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    const { analysis, warnings: fileWarnings } = await analyzeFile(file, aliases);
    analyses.set(file, analysis);
    warnings.push(...fileWarnings);
    for (const imp of analysis.imports) {
      if (queued.has(imp)) continue;
      if (imp.split(path.sep).includes("node_modules")) continue;
      if (!SOURCE_EXTENSIONS.some((ext) => imp.endsWith(ext))) continue;
      queued.add(imp);
      queue.push(imp);
    }
  }

  // Cross-file <CmsGroup>: the runtime prefix crosses component boundaries
  // via React context, the static prefix cannot. Warn when a group wraps an
  // imported component whose graph declares regions - the manifest would
  // register them unprefixed while the page reads them prefixed, so the
  // block would never resolve.
  /** @type {Map<string, boolean>} */
  const regionMemo = new Map();
  /** @type {Set<string>} */
  const seenGroupWarnings = new Set();
  for (const analysis of analyses.values()) {
    for (const ref of analysis.groupComponentRefs) {
      if (!hasReachableRegions(ref.file, analyses, regionMemo)) continue;
      const key = `${analysis.file}|${ref.prefix}|${ref.componentName}`;
      if (seenGroupWarnings.has(key)) continue;
      seenGroupWarnings.add(key);
      warnings.push({
        file: analysis.file,
        loc: ref.loc,
        message:
          `<CmsGroup name="${ref.prefix}"> wraps <${ref.componentName}>, but the group prefix doesn't reach into imported components at discovery time (it does at runtime), so their blockPaths won't match the manifest. Move the <CmsGroup> inside the component, or bake "${ref.prefix}." into each blockPath.`,
      });
    }
  }

  /** @type {Map<string, Map<string, ManifestBlockItem>>} */
  const bySlug = new Map();

  // Page-scoped regions: walk every withCms root, follow imports DFS, file
  // each non-global region under the page's slug. Global regions are handled
  // separately below so a Header/Footer shared across pages isn't duplicated.
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
        if (region.scope === "global") continue;
        if (blockMap.has(region.blockPath)) continue;
        blockMap.set(region.blockPath, regionToEntry(region, nextSortOrder++));
      }
    }
  }

  // Global-scoped regions: dedup by blockPath across the whole tree. sortOrder
  // follows the stable file-traversal order, so the Drawer lists header/footer
  // fields the same way regardless of which page is loaded.
  /** @type {Map<string, ManifestBlockItem>} */
  const globalMap = new Map();
  let globalSortOrder = 1;
  for (const analysis of analyses.values()) {
    for (const region of analysis.regions) {
      if (region.scope !== "global") continue;
      if (globalMap.has(region.blockPath)) continue;
      globalMap.set(region.blockPath, regionToEntry(region, globalSortOrder++));
    }
  }

  /** @type {SyncManifestRequest[]} */
  const manifests = [];
  for (const [slug, blockMap] of bySlug) {
    manifests.push({ slug, blocks: [...blockMap.values()] });
  }
  if (globalMap.size > 0) {
    manifests.push({ slug: globalSlug, blocks: [...globalMap.values()] });
  }
  manifests.sort((a, b) => a.slug.localeCompare(b.slug));

  return { manifests, warnings };
}

/**
 * @param {DiscoveredRegion} region
 * @param {number} sortOrder
 * @returns {ManifestBlockItem}
 */
function regionToEntry(region, sortOrder) {
  /** @type {ManifestBlockItem} */
  const entry = {
    blockPath: region.blockPath,
    blockType: region.blockType,
    defaultValue: region.defaultValue,
    sortOrder,
  };
  if (region.itemSchema) entry.itemSchema = region.itemSchema;
  return entry;
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
 * @typedef {Object} PathAliases
 * @property {string} baseDir  Directory `paths` targets resolve against (config dir + baseUrl).
 * @property {{ exact: boolean, prefix: string, suffix: string, targets: string[] }[]} entries
 */

/**
 * Resolve an import specifier to a source file. Relative specs resolve
 * against the importing file; bare specs are tried against the project's
 * `paths` aliases. `unresolvedAlias` flags a spec that looked like an alias
 * (matched a `paths` pattern, or the conventional `@/` prefix, which is not
 * a valid npm scope) but resolved to nothing, so the caller can warn instead
 * of silently dropping the file's regions.
 *
 * @param {string} fromFile
 * @param {string} spec
 * @param {PathAliases | null} aliases
 * @returns {{ file: string | null, unresolvedAlias: boolean }}
 */
function resolveImportSpec(fromFile, spec, aliases) {
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(fromFile), spec);
    return { file: resolveAsFileOrDir(base), unresolvedAlias: false };
  }

  let matchedAlias = false;
  if (aliases) {
    for (const entry of aliases.entries) {
      /** @type {string} */
      let wildcard;
      if (entry.exact) {
        if (spec !== entry.prefix) continue;
        wildcard = "";
      } else {
        if (!spec.startsWith(entry.prefix) || !spec.endsWith(entry.suffix)) continue;
        wildcard = spec.slice(entry.prefix.length, spec.length - entry.suffix.length);
      }
      matchedAlias = true;
      for (const target of entry.targets) {
        const candidate = path.resolve(
          aliases.baseDir,
          entry.exact ? target : target.replace("*", wildcard),
        );
        const file = resolveAsFileOrDir(candidate);
        if (file) return { file, unresolvedAlias: false };
      }
    }
  }
  return { file: null, unresolvedAlias: matchedAlias || spec.startsWith("@/") };
}

/**
 * Node-ish resolution for one base path: exact file, then known source
 * extensions, then directory index files.
 *
 * @param {string} base
 * @returns {string | null}
 */
function resolveAsFileOrDir(base) {
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

/**
 * Find the nearest jsconfig.json/tsconfig.json at or above the app root and
 * pull out `compilerOptions.paths`, so alias imports resolve the way Next.js
 * resolves them. The climb stops at the first directory holding a config or
 * a package.json (the package boundary), never crossing into an unrelated
 * outer project.
 *
 * @param {string} appRoot
 * @returns {PathAliases | null}
 */
function loadPathAliases(appRoot) {
  let dir = path.resolve(appRoot);
  for (;;) {
    for (const name of ["jsconfig.json", "tsconfig.json"]) {
      const configPath = path.join(dir, name);
      if (existsSync(configPath)) return parseAliasConfig(configPath, dir);
    }
    if (existsSync(path.join(dir, "package.json"))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {string} configPath
 * @param {string} dir
 * @returns {PathAliases | null}
 */
function parseAliasConfig(configPath, dir) {
  try {
    const json = JSON.parse(stripJsonc(readFileSync(configPath, "utf8")));
    const paths = json?.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") return null;
    const baseDir = path.resolve(dir, json.compilerOptions.baseUrl ?? ".");
    /** @type {PathAliases["entries"]} */
    const entries = [];
    for (const [pattern, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets)) continue;
      const stringTargets = targets.filter((t) => typeof t === "string");
      if (stringTargets.length === 0) continue;
      const star = pattern.indexOf("*");
      entries.push({
        exact: star === -1,
        prefix: star === -1 ? pattern : pattern.slice(0, star),
        suffix: star === -1 ? "" : pattern.slice(star + 1),
        targets: stringTargets,
      });
    }
    return entries.length > 0 ? { baseDir, entries } : null;
  } catch {
    // Unreadable config: aliases just don't resolve, and the
    // unresolved-alias warning points at the import instead.
    return null;
  }
}

/**
 * Strip line and block comments plus trailing commas so tsconfig-style
 * JSONC parses with JSON.parse. String contents (e.g. "http://x") survive.
 *
 * @param {string} src
 * @returns {string}
 */
function stripJsonc(src) {
  let out = "";
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += src[++i] ?? ""; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Whether `file`'s import graph (itself included) declares any region.
 * Memoised; `visiting` cuts cycles.
 *
 * @param {string} file
 * @param {Map<string, FileAnalysis>} analyses
 * @param {Map<string, boolean>} memo
 * @param {Set<string>} [visiting]
 * @returns {boolean}
 */
function hasReachableRegions(file, analyses, memo, visiting = new Set()) {
  const cached = memo.get(file);
  if (cached !== undefined) return cached;
  if (visiting.has(file)) return false;
  visiting.add(file);
  const analysis = analyses.get(file);
  const found = analysis
    ? analysis.regions.length > 0 ||
      analysis.imports.some((imp) => hasReachableRegions(imp, analyses, memo, visiting))
    : false;
  memo.set(file, found);
  return found;
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
 * @param {PathAliases | null} aliases
 * @returns {Promise<{ analysis: FileAnalysis, warnings: DiscoveryWarning[] }>}
 */
async function analyzeFile(filePath, aliases) {
  const source = await readFile(filePath, "utf8");
  const lang = LANG_BY_EXT[path.extname(filePath)] ?? "jsx";

  /** @type {FileAnalysis} */
  const analysis = {
    file: filePath,
    imports: [],
    importBindings: new Map(),
    withCmsSlugs: [],
    regions: [],
    groupComponentRefs: [],
  };
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  // A file that fails to parse is skipped, not fatal: one broken (or
  // oxc-unsupported) file shouldn't kill the whole sync. The warning is loud
  // because the file's regions are missing from this run.
  let program;
  try {
    const parsed = parseSync(filePath, source, { lang });
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
    program = parsed.program;
  } catch (err) {
    warnings.push({
      file: filePath,
      loc: null,
      message: `Failed to parse: ${err instanceof Error ? err.message : String(err)}. Skipping this file; regions declared in it won't be discovered this run.`,
    });
    return { analysis, warnings };
  }

  // oxc spans are character offsets (UTF-16, i.e. JS string indices); the
  // locator turns them into Babel-style { line (1-based), column (0-based) }.
  const locator = makeLocator(source);

  // Stack of `<CmsGroup name>` prefixes, pushed/popped on JSXElement
  // enter/leave. Child EditableRegion/EditableList prepend the joined prefix
  // to their static blockPath, mirroring the runtime `<CmsGroup>` context.
  /** @type {string[]} */
  const groupStack = [];
  const currentPrefix = () => groupStack.filter(Boolean).join(".");

  walk(program, {
    enter(node) {
      switch (node.type) {
        case "ImportDeclaration": {
          const { file: resolved, unresolvedAlias } = resolveImportSpec(
            filePath, node.source.value, aliases,
          );
          if (resolved) {
            analysis.imports.push(resolved);
            for (const spec of node.specifiers ?? []) {
              if (spec.local?.name) analysis.importBindings.set(spec.local.name, resolved);
            }
          } else if (unresolvedAlias) {
            warnings.push({
              file: filePath,
              loc: locOf(node, locator),
              message: `Import "${node.source.value}" looks like a path alias but couldn't be resolved (checked jsconfig/tsconfig "paths"). Regions in that file won't be discovered.`,
            });
          }
          return;
        }
        case "JSXElement": {
          const opening = node.openingElement;
          if (opening.name.type !== "JSXIdentifier" || opening.name.name !== "CmsGroup") return;
          const props = readJsxProps(opening);
          if (typeof props.name !== "string") {
            warnings.push({
              file: filePath,
              loc: locOf(opening, locator),
              message:
                "<CmsGroup> needs a static string `name` prop. Treating as a transparent wrapper - blockPaths inside won't be prefixed.",
            });
            groupStack.push(""); // placeholder so leave() pops the matching push
            return;
          }
          groupStack.push(props.name);
          return;
        }
        case "CallExpression": {
          const callee = node.callee;
          if (callee.type !== "Identifier") return;

          if (callee.name === "withCms") {
            const slug = literalString(node.arguments[0]);
            if (slug == null) {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message:
                  "withCms() called with a non-literal slug - skipping. Pass a string literal so the manifest discovery can statically resolve it.",
              });
              return;
            }
            analysis.withCmsSlugs.push(slug);
            return;
          }

          // useCmsBlock("path", { blockType, defaultValue }): read-only block
          // declaration. No metadata arg means nothing to register, so ignore it.
          if (callee.name === "useCmsBlock") {
            const blockPath = literalString(node.arguments[0]);
            if (blockPath == null) return;
            const metaNode = node.arguments[1];
            if (!metaNode) return;
            const meta = evalLiteral(metaNode);
            if (meta === UNRESOLVED || meta === null || typeof meta !== "object") {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message: `useCmsBlock("${blockPath}", ...) metadata must be a static object literal. Skipping.`,
              });
              return;
            }
            if (typeof meta.blockType !== "string" || !("defaultValue" in meta)) {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message: `useCmsBlock("${blockPath}", ...) metadata is missing blockType or defaultValue. Skipping.`,
              });
              return;
            }
            analysis.regions.push({
              blockPath,
              blockType: /** @type {BlockType} */ (meta.blockType),
              defaultValue: meta.defaultValue,
            });
          }
          return;
        }
        case "JSXOpeningElement": {
          const name = node.name;
          if (name.type !== "JSXIdentifier") return;
          if (name.name === "EditableRegion") {
            handleEditableRegion(node, filePath, analysis, warnings, currentPrefix(), locator);
          } else if (name.name === "EditableList") {
            handleEditableList(node, filePath, analysis, warnings, currentPrefix(), locator);
          } else if (/^[A-Z]/.test(name.name) && name.name !== "CmsGroup") {
            // Imported component rendered inside a <CmsGroup>: candidate for
            // the cross-file prefix warning. Only names bound by a resolved
            // import qualify; package components (bare specifiers) can't
            // contain regions.
            const prefix = currentPrefix();
            const target = prefix ? analysis.importBindings.get(name.name) : undefined;
            if (prefix && target) {
              analysis.groupComponentRefs.push({
                componentName: name.name,
                file: target,
                prefix,
                loc: locOf(node, locator),
              });
            }
          }
          // `<CollectionRegion>` / `<CollectionItem>` deliberately emit no
          // manifest blocks: collection bindings live in a runtime registry,
          // kept out of the CMS block namespace. See CollectionProvider.
          return;
        }
      }
    },
    leave(node) {
      if (node.type !== "JSXElement") return;
      const opening = node.openingElement;
      if (opening.name.type === "JSXIdentifier" && opening.name.name === "CmsGroup") {
        groupStack.pop();
      }
    },
  });

  return { analysis, warnings };
}

/**
 * Pull a static `<EditableRegion>` declaration into the file analysis.
 * blockPath and blockType are required (missing either warns and skips). A
 * missing defaultValue is tolerated: the region syncs seeded with "" and
 * warns. `groupPrefix` (joined enclosing `<CmsGroup>` names) is prepended to
 * the blockPath so the manifest matches the runtime context lookup.
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 * @param {string} groupPrefix
 * @param {Locator} locator
 */
function handleEditableRegion(openingNode, filePath, analysis, warnings, groupPrefix, locator) {
  const props = readJsxProps(openingNode);
  const rawBlockPath = props.blockPath;
  const blockType = props.blockType;
  const hasDefault = Object.prototype.hasOwnProperty.call(props, "defaultValue");

  if (typeof rawBlockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message:
        "<EditableRegion> needs a static blockPath string. Skipping discovery for this region.",
    });
    return;
  }
  const blockPath = groupPrefix ? `${groupPrefix}.${rawBlockPath}` : rawBlockPath;

  if (typeof blockType !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableRegion blockPath="${blockPath}"> is missing a static blockType prop. Skipping.`,
    });
    return;
  }
  if (!hasDefault) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableRegion blockPath="${blockPath}"> has no static defaultValue prop. Syncing with an empty string (""); set a static defaultValue to seed initial content.`,
    });
  }

  /** @type {DiscoveredRegion} */
  const region = {
    blockPath,
    blockType: /** @type {BlockType} */ (blockType),
    defaultValue: hasDefault ? props.defaultValue : "",
  };
  const scope = readScopeProp(props, openingNode, blockPath, filePath, warnings, locator);
  if (scope) region.scope = scope;
  analysis.regions.push(region);
}

/**
 * Pull a static `<EditableList>` declaration into the file analysis.
 * blockPath and itemSchema are required; `defaultValue` defaults to `[]`.
 * `groupPrefix` applies the same prefix rule as EditableRegion.
 *
 * itemSchema must be an object literal whose values are `{ blockType,
 * defaultValue }` pairs (the manifest's `ItemSchema` shape).
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 * @param {string} groupPrefix
 * @param {Locator} locator
 */
function handleEditableList(openingNode, filePath, analysis, warnings, groupPrefix, locator) {
  const props = readJsxProps(openingNode);
  const rawBlockPath = props.blockPath;
  const itemSchema = props.itemSchema;

  if (typeof rawBlockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message:
        "<EditableList> needs a static blockPath string. Skipping discovery for this list.",
    });
    return;
  }
  const blockPath = groupPrefix ? `${groupPrefix}.${rawBlockPath}` : rawBlockPath;
  if (!isValidItemSchema(itemSchema)) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
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
      loc: locOf(openingNode, locator),
      message: `<EditableList blockPath="${blockPath}"> defaultValue must be an array. Skipping.`,
    });
    return;
  }

  /** @type {DiscoveredRegion} */
  const region = {
    blockPath,
    blockType: /** @type {BlockType} */ ("List"),
    defaultValue,
    itemSchema,
  };
  const scope = readScopeProp(props, openingNode, blockPath, filePath, warnings, locator);
  if (scope) region.scope = scope;
  analysis.regions.push(region);
}

/**
 * Validate the `scope` prop. Only `"global"` is accepted; anything else
 * warns and falls back to page-scoped. Missing scope is silent (the common case).
 *
 * @param {Record<string, *>} props
 * @param {*} openingNode
 * @param {string} blockPath
 * @param {string} filePath
 * @param {DiscoveryWarning[]} warnings
 * @param {Locator} locator
 * @returns {string | null}
 */
function readScopeProp(props, openingNode, blockPath, filePath, warnings, locator) {
  if (!Object.prototype.hasOwnProperty.call(props, "scope")) return null;
  const scope = props.scope;
  if (scope === "global") return "global";
  warnings.push({
    file: filePath,
    loc: locOf(openingNode, locator),
    message: `<EditableRegion blockPath="${blockPath}"> has unsupported scope=${JSON.stringify(scope)}. Treating as page-scoped. Only "global" is recognized today.`,
  });
  return null;
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
  if (node && node.type === "Literal" && typeof node.value === "string") return node.value;
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
  if (node.type === "Literal") return node.value;
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
    case "Literal":
      // RegExp / BigInt literals aren't plain JSON values; treat as unresolved.
      if (node.regex || node.bigint) return UNRESOLVED;
      return node.value;
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
        if (prop.type !== "Property") return UNRESOLVED;
        const key =
          prop.key.type === "Identifier" ? prop.key.name :
          prop.key.type === "Literal" && typeof prop.key.value === "string" ? prop.key.value :
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
 * @param {Locator} locator
 * @returns {{ line: number, column: number } | null}
 */
function locOf(node, locator) {
  if (!node || typeof node.start !== "number") return null;
  return locator(node.start);
}

/**
 * @typedef {(offset: number) => { line: number, column: number }} Locator
 */

/**
 * Build an offset -> { line, column } mapper for one source string. Lines
 * 1-based, columns 0-based. Offsets are UTF-16 (JS string indices), which is
 * what oxc emits.
 *
 * @param {string} source
 * @returns {Locator}
 */
function makeLocator(source) {
  /** @type {number[]} */
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) lineStarts.push(i + 1);
  }
  return (offset) => {
    // Greatest line start <= offset (binary search).
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] };
  };
}

/**
 * @typedef {Object} Visitors
 * @property {(node: any) => void} enter
 * @property {(node: any) => void} [leave]
 */

/**
 * Minimal depth-first walk over the plain-object ESTree AST oxc returns. A
 * node is any object with a string `type`; children live in node- or
 * array-valued properties. We only need enter/leave in source order.
 *
 * @param {any} node
 * @param {Visitors} visitors
 */
function walk(node, visitors) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visitors);
    return;
  }
  if (typeof node.type !== "string") return;
  visitors.enter(node);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end") continue;
    walk(node[key], visitors);
  }
  if (visitors.leave) visitors.leave(node);
}