import { describe, it, expect } from "vitest";

/**
 * @file Guards a bug class that nothing else can see.
 *
 * An inline style always outranks a stylesheet, so an element that names a
 * property inline silently kills the :hover, :focus or .is-* rule its class
 * writes for that same property. The code stays valid, the types check, and
 * every behavioural test still passes, because only the appearance is wrong.
 *
 * It came back four times in one sitting: a list box framed in currentColor, a
 * picker row that would not highlight, a calendar day with no hover, no today
 * and no selected fill, and a clock pill that would not light. That is what
 * made it worth a check rather than another round of finding them by eye.
 *
 * The scan lives here rather than in `src/editors` because it reads the repo
 * off disk: it is a check, not something the package ships.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { fieldCss } from "../../editors/field-css.js";

// Shorthands swallow their longhands, so `background` inline shadows a
// `background-color` rule. Comparing family roots rather than exact names is
// what catches that.
const FAMILY = [
  "background", "border", "outline", "font", "padding", "margin", "transition",
];
const root = (prop) => {
  const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return FAMILY.find((f) => camel === f || camel.startsWith(f)) ?? camel;
};

/** Properties each class declares in a state rule, which is what can be shadowed. */
function stateProps(css) {
  const out = new Map();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!/:hover|:focus|:active|\.is-/.test(selector)) continue;
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((p) => root(p[1]));
    for (const cls of selector.matchAll(/\.(inscribed-[a-z0-9-]+)/g)) {
      const set = out.get(cls[1]) ?? new Set();
      props.forEach((p) => set.add(p));
      out.set(cls[1], set);
    }
  }
  return out;
}

const walk = (node, fn) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node.type) fn(node);
  for (const k of Object.keys(node)) if (k !== "type") walk(node[k], fn);
};

const quasiClasses = (tpl) =>
  tpl.quasis.flatMap((q) => (q.value?.raw ?? "").split(/\s+/));

/**
 * Class names an attribute value can produce, taking only its literal parts.
 *
 * Calls are resolved against `helpers` because the components that build a
 * class list from state do it through one (`rowClass`, `dayClass`), and those
 * are exactly the elements this check exists for.
 */
function classesOf(value, helpers) {
  if (!value) return [];
  if (value.type === "Literal") return String(value.value).split(/\s+/);
  const expr = value.type === "JSXExpressionContainer" ? value.expression : value;
  if (expr?.type === "TemplateLiteral") return quasiClasses(expr);
  if (expr?.type === "CallExpression" && expr.callee?.type === "Identifier") {
    return helpers.get(expr.callee.name) ?? [];
  }
  return [];
}

/** Inline property names an element sets, resolving a bare identifier to its const. */
function inlineProps(value, consts) {
  const expr = value?.type === "JSXExpressionContainer" ? value.expression : null;
  if (!expr) return [];
  const fromObject = (obj) =>
    (obj.properties ?? [])
      .filter((p) => p.type === "Property" && p.key)
      .map((p) => p.key.name ?? p.key.value)
      .filter(Boolean);
  if (expr.type === "ObjectExpression") {
    return [
      ...fromObject(expr),
      // `{ ...someStyle, x: 1 }` also drags in the spread object's keys.
      ...(expr.properties ?? [])
        .filter((p) => p.type === "SpreadElement" && p.argument?.type === "Identifier")
        .flatMap((p) => consts.get(p.argument.name) ?? []),
    ];
  }
  if (expr.type === "Identifier") return consts.get(expr.name) ?? [];
  return [];
}

function scanFile(file, states) {
  const src = readFileSync(file, "utf8");
  const { program } = parseSync(file, src, { sourceType: "module" });
  const consts = new Map();
  const helpers = new Map();
  walk(program, (n) => {
    // `const rowClass = (a, b) => \`inscribed-picker-row ...\`` and the same
    // shape written as a function declaration.
    if (n.type === "VariableDeclarator" && n.id?.type === "Identifier") {
      const body = n.init?.type === "ArrowFunctionExpression" ? n.init.body : null;
      if (body?.type === "TemplateLiteral") helpers.set(n.id.name, quasiClasses(body));
    }
    if (n.type === "VariableDeclarator" && n.id?.type === "Identifier" && n.init?.type === "ObjectExpression") {
      consts.set(n.id.name, (n.init.properties ?? [])
        .filter((p) => p.type === "Property" && p.key)
        .map((p) => p.key.name ?? p.key.value).filter(Boolean));
    }
  });

  const findings = [];
  walk(program, (n) => {
    if (n.type !== "JSXOpeningElement") return;
    const attr = (name) => (n.attributes ?? []).find((a) => a.type === "JSXAttribute" && a.name?.name === name);
    const classes = classesOf(attr("className")?.value, helpers).filter((c) => states.has(c));
    if (classes.length === 0) return;
    const props = new Set(inlineProps(attr("style")?.value, consts).map(root));
    for (const cls of classes) {
      for (const p of states.get(cls)) {
        if (props.has(p)) findings.push({ file, cls, prop: p, line: n.start });
      }
    }
  });
  return findings;
}

function findShadowedStyles(dir = "src") {
  const files = [];
  (function collect(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) collect(p);
      else if (p.endsWith(".jsx") && !p.includes("tests")) files.push(p);
    }
  })(dir);
  const states = stateProps(fieldCss);
  return files.flatMap((f) => scanFile(f, states));
}

describe("no inline style outranks a class's own state rules", () => {
  it("finds nothing shadowed", () => {
    // Listed rather than counted, so a failure names the element and property.
    const lines = findShadowedStyles().map(
      (s) => `${s.file}: .${s.cls} overrides "${s.prop}" inline`,
    );
    expect(lines).toEqual([]);
  });
});
