/**
 * @file Next metadata from a page's `seo.*` blocks. Pure, so `cms-page.jsx`
 * only wires reads in.
 */

import { localizePath } from "./route.js";

/**
 * @import { CmsConfig } from "./config.js"
 * @import { BlockResponse } from "./contracts/schemas.js"
 */

/** The blocks `CmsPage.metadata` gives a page, in drawer order. */
export const SEO_BLOCKS = /** @type {const} */ ([
  { key: "title", blockPath: "seo.title", blockType: "ShortText", empty: "" },
  { key: "description", blockPath: "seo.description", blockType: "LongText", empty: "" },
  { key: "image", blockPath: "seo.image", blockType: "Image", empty: { src: "", alt: "" } },
  { key: "noindex", blockPath: "seo.noindex", blockType: "Bool", empty: false },
]);

/**
 * @typedef {Object} SeoFields
 * @property {string} title
 * @property {string} description
 * @property {{ url: string, alt?: string } | null} image
 * @property {boolean} noindex
 */

const ENTITIES = /** @type {Record<string, string>} */ ({
  amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", nbsp: " ",
});

/**
 * One line of plain text. Markup (a RichText field) is reduced to its words.
 *
 * @param {*} value
 * @returns {string}
 */
export function textOf(value) {
  if (typeof value !== "string") return "";
  const text = /^\s*</.test(value)
    ? value.replace(/<[^>]*>/g, " ").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name])
    : value;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @param {*} value
 * @returns {{ url: string, alt?: string } | null}
 */
export function imageOf(value) {
  if (!value || typeof value !== "object" || typeof value.src !== "string" || !value.src) return null;
  return value.alt ? { url: value.src, alt: value.alt } : { url: value.src };
}

/**
 * @param {*} value
 * @returns {boolean | null}
 */
export function boolOf(value) {
  return typeof value === "boolean" ? value : null;
}

/**
 * The value a seed holds for `locale`. A plain object whose keys are all
 * languages is a per-language map, read the way `cms-sync` seeds it: a language
 * it leaves out takes the default language's value.
 *
 * @param {*} seed
 * @param {string|null} locale
 * @param {readonly string[]} locales
 * @returns {*}
 */
export function seedIn(seed, locale, locales) {
  if (!seed || typeof seed !== "object" || Array.isArray(seed) || locales.length === 0) return seed;
  const keys = Object.keys(seed);
  if (keys.length === 0 || !keys.every((key) => locales.includes(key))) return seed;
  return seed[locale ?? locales[0]] ?? seed[locales[0]];
}

/**
 * A page's SEO in one language: what the editor wrote, else the code's
 * default for that language. Empty means "fall back", so clearing a field
 * hands it back to the code.
 *
 * @param {BlockResponse[] | undefined} blocks
 * @param {Record<string, *> | undefined} seeds
 * @param {string|null} locale
 * @param {readonly string[]} locales
 * @returns {SeoFields}
 */
export function pageSeoFields(blocks, seeds, locale, locales) {
  /** @param {string} blockPath */
  const stored = (blockPath) => blocks?.find((block) => block.blockPath === blockPath)?.value;
  /** @param {string} key */
  const seed = (key) => seedIn(seeds?.[key], locale, locales);
  return {
    title: textOf(stored("seo.title")) || textOf(seed("title")),
    description: textOf(stored("seo.description")) || textOf(seed("description")),
    image: imageOf(stored("seo.image")) ?? imageOf(seed("image")),
    noindex: boolOf(stored("seo.noindex")) ?? boolOf(seed("noindex")) ?? false,
  };
}

/**
 * Put a route's params into a slug template: `/news/[id]` with `{ id: "5" }`
 * is `/news/5`. An optional catch-all with no value drops out.
 *
 * @param {string} slug
 * @param {Record<string, *>} [params]
 * @returns {string}
 */
export function fillSlug(slug, params) {
  /** @type {string[]} */
  const out = [];
  for (const part of slug.split("/").filter(Boolean)) {
    const match = /^\[\[?(?:\.\.\.)?([^\]]+)\]?\]$/.exec(part);
    const value = match ? params?.[match[1]] : undefined;
    if (!match || value == null || value === "") {
      if (!(match && part.startsWith("[["))) out.push(part);
      continue;
    }
    for (const segment of Array.isArray(value) ? value : [value]) out.push(encodeURIComponent(segment));
  }
  return `/${out.join("/")}`;
}

/**
 * @param {string} path
 * @param {string|null} siteUrl
 * @returns {string}
 */
export function absoluteUrl(path, siteUrl) {
  if (!siteUrl) return path;
  return path === "/" ? siteUrl : `${siteUrl}${path}`;
}

/**
 * Where one page lives in every language, keyed the way hreflang wants it,
 * `x-default` being the default language's address.
 *
 * @param {string} path      Locale-free, e.g. `/about`.
 * @param {CmsConfig} config
 * @returns {Record<string, string>}
 */
export function languageLinks(path, config) {
  /** @type {Record<string, string>} */
  const links = {};
  for (const locale of config.locales) {
    links[locale] = absoluteUrl(localizePath(path, locale, config), config.siteUrl);
  }
  if (config.defaultLocale) links["x-default"] = links[config.defaultLocale];
  return links;
}

/**
 * Next metadata for fields already resolved. `inherited` is the parent
 * segments' Open Graph: Next replaces that object whole when a page sets one,
 * so the site name and default image a layout put there are carried over here.
 *
 * @param {{
 *   fields: SeoFields,
 *   canonical: string | null,
 *   languages?: Record<string, string>,
 *   absoluteTitle?: boolean,
 *   inherited?: Record<string, *> | null,
 * }} input
 * @returns {Record<string, *>}
 */
export function seoMetadata({ fields, canonical, languages, absoluteTitle, inherited }) {
  const { title, description, image, noindex } = fields;
  /** @type {Record<string, *>} */
  const meta = {
    // Null rather than left out, which would inherit the site-wide one: the
    // same description on every page helps nobody, Google writes its own.
    description: description || null,
    alternates: { ...(canonical ? { canonical } : null), ...(languages ? { languages } : null) },
    openGraph: {
      ...inherited,
      ...(title ? { title } : null),
      description: description || undefined,
      ...(canonical ? { url: canonical } : null),
      ...(image ? { images: [image] } : null),
    },
  };
  if (title) meta.title = absoluteTitle ? { absolute: title } : title;
  if (noindex) meta.robots = { index: false, follow: true };
  return meta;
}
