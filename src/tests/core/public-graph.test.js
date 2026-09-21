/**
 * What a visitor's bundle is allowed to contain.
 *
 * The page-side primitives each split in two, so the ring, the chip, the
 * in-place editors, the panel's string catalogs and the icon set are reached
 * through a dynamic import and only by someone who can edit. That is a property
 * of the import graph, and nothing in a component test would notice it going
 * away: a static import added back would keep every behaviour and quietly put
 * ~20 KB (gzipped) back on every page of every site.
 *
 * So the graph itself is the assertion. Walks static imports only, from the
 * public entry points, and fails naming both the offender and the path to it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../..");

/** Admin-only weight, each with what makes it too expensive to ship widely. */
const ADMIN_ONLY = {
  "shared/i18n/en/index.js": "the panel's English string catalog",
  "shared/i18n/tr/index.js": "the panel's Turkish string catalog",
  "core/hooks/use-cms-strings.js": "the panel's wording",
  "shared/style/icons.jsx": "the admin icon set",
  "editors/field-css.js": "the editor stylesheet",
  "core/page-region-chrome.js": "the page-side edit chrome",
  "core/hooks/use-list-reorder.js": "the drag-and-drop engine",
  "shared/ui/PositionField.jsx": "the list position field",
  "editors/inline/InlineTextEditor.jsx": "the in-place text editor",
  "editors/FieldEditor.jsx": "the drawer's field editors",
  "collections/hooks/use-collection-editor.js": "the record editor engine",
  "admin/Drawer.jsx": "the admin panel",
};

const EXTENSIONS = ["", ".js", ".jsx", "/index.js", "/index.jsx"];

/** @param {string} from @param {string} spec @returns {string | null} */
function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Static specifiers only. `import(...)` is deliberately not matched: that is
 * the boundary this test exists to protect.
 *
 * @param {string} source
 * @returns {string[]}
 */
function staticImports(source) {
  const out = [];
  // `import ... from "x"` and the side-effect form `import "x"`.
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  // `export ... from "x"`, which the entry barrels are made of.
  for (const m of source.matchAll(/(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * @param {string} entry
 * @returns {Map<string, string[]>}  Every reachable file, with the path taken.
 */
function reachable(entry) {
  const trails = new Map([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = /** @type {string} */ (queue.shift());
    const trail = /** @type {string[]} */ (trails.get(file));
    for (const spec of staticImports(readFileSync(file, "utf8"))) {
      const target = resolveImport(file, spec);
      if (!target || trails.has(target)) continue;
      trails.set(target, [...trail, target]);
      queue.push(target);
    }
  }
  return trails;
}

const rel = (p) => path.relative(SRC, p).split(path.sep).join("/");

/** @param {string} entry */
function offenders(entry) {
  const trails = reachable(path.join(SRC, entry));
  /** @type {string[]} */
  const found = [];
  for (const [file, trail] of trails) {
    const name = rel(file);
    const why = ADMIN_ONLY[name];
    if (!why) continue;
    found.push(`${name} (${why})\n    reached via ${trail.map(rel).join(" → ")}`);
  }
  return found;
}

describe("the public entry points", () => {
  it("reach nothing that only an editor can use", () => {
    expect(offenders("index.js")).toEqual([]);
  });

  it("keep collections clear of it too, barrel included", () => {
    // The barrel is the one that matters: a page importing one export from it
    // gets everything the others reach, and no bundler can shake that back out.
    // The writing surfaces, which do reach the editors, live at
    // `inscribed/compose` for exactly this reason.
    expect(offenders("collections.js")).toEqual([]);
    expect(offenders("collections/CollectionRegion.jsx")).toEqual([]);
    expect(offenders("collections/CollectionItem.jsx")).toEqual([]);
    expect(offenders("collections/CollectionField.jsx")).toEqual([]);
  });
});
