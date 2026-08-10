/**
 * @file Resolving the admin panel's own wording, and the `t` that reads it.
 *
 * The panel's language is deliberately unrelated to `locales`, which is the set
 * of languages the *site's content* comes in. Those are arbitrary (`de`, `ja`,
 * whatever the client sells in) while the panel only speaks what someone has
 * written a catalog for, and an editor working through the English copy of a
 * page has no reason to have their toolbar change under them.
 *
 * Keys are flat, and that is what makes a partial override work: a caller
 * supplying six strings gets six strings, not a deep merge they have to reason
 * about. Everything they leave out falls through to English, which is both the
 * default and the backstop.
 *
 * A locale with no built-in catalog is a first-class case, not an error: pass
 * `adminLocale: "de"` with `adminStrings`, and plural selection follows German
 * while anything unwritten still reads in English.
 */

import { en } from "./en/index.js";
import { tr } from "./tr/index.js";
import { DEFAULT_ADMIN_LOCALE } from "./default-locale.js";

/** Built-in catalogs. Anything else arrives through `adminStrings`. */
const CATALOGS = { en, tr };

export { DEFAULT_ADMIN_LOCALE };

/**
 * @param {string} [adminLocale]
 * @param {Record<string, string> | null} [adminStrings]
 * @returns {Record<string, string>}
 */
export function resolveStrings(adminLocale, adminStrings) {
  const builtIn = CATALOGS[adminLocale ?? DEFAULT_ADMIN_LOCALE];
  // English underneath every time, so a catalog that has drifted behind (a
  // built-in mid-release, or someone's hand-written language) is missing
  // wording rather than showing a raw key.
  return layer(layer(en, builtIn), adminStrings);
}

/** @param {string} key */
function stemOf(key) {
  return key.replace(/_(zero|one|two|few|many|other)$/, "");
}

/**
 * Merge one catalog over another, letting the upper one own every plural form
 * of any key it speaks to.
 *
 * A plain spread looked equivalent and was not. Turkish takes one form after a
 * number so it writes only `status.unsaved_other`, but CLDR still sorts 1 into
 * the `one` category, and English's `status.unsaved_one` survived the spread
 * underneath it. "1 kaydedilmemiş değişiklik" came out in English while "3"
 * came out in Turkish.
 *
 * @param {Record<string, string>} base
 * @param {Record<string, string> | null | undefined} over
 * @returns {Record<string, string>}
 */
function layer(base, over) {
  if (!over) return base;
  const claimed = new Set(Object.keys(over).map(stemOf));
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, text] of Object.entries(base)) {
    if (claimed.has(stemOf(key)) && !Object.hasOwn(over, key)) continue;
    out[key] = text;
  }
  return Object.assign(out, over);
}

/**
 * @typedef {(key: string, params?: Record<string, string|number>) => string} Translate
 */

/**
 * @param {Record<string, string>} strings
 * @param {string} [locale]
 * @returns {Translate}
 */
export function createTranslator(strings, locale) {
  const tag = locale ?? DEFAULT_ADMIN_LOCALE;
  let plurals;

  return function t(key, params) {
    let entry = strings[key];

    // `count` is the signal, matching what every catalog format uses. Turkish
    // needs one form and English two, so the variants live in the catalog
    // rather than in a rule the call site has to know about.
    if (params && typeof params.count === "number") {
      if (!plurals) plurals = pluralRulesFor(tag);
      const category = plurals ? plurals.select(params.count) : "other";
      entry = strings[`${key}_${category}`] ?? strings[`${key}_other`] ?? entry;
    }

    if (entry == null) {
      warnOnce(key);
      // The key itself, not an empty string: a blank button is a mystery, and
      // a visible `drawer.save` names the thing to go fix.
      return key;
    }

    return params ? interpolate(entry, params) : entry;
  };
}

/**
 * `Intl.PluralRules` is a browser built-in, but an unknown tag throws rather
 * than falling back, and no plural forms at all beats no panel.
 *
 * @param {string} tag
 */
function pluralRulesFor(tag) {
  try {
    return new Intl.PluralRules(tag);
  } catch {
    return null;
  }
}

/**
 * @param {string} template
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (whole, name) => (
    // An unknown placeholder stays as written, so a typo reads as `{tiem}` in
    // the UI instead of quietly deleting itself.
    Object.hasOwn(params, name) ? String(params[name]) : whole
  ));
}

/** @type {Set<string>} */
const warned = new Set();

/** @param {string} key */
function warnOnce(key) {
  if (process.env.NODE_ENV === "production") return;
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[inscribed] no admin string for "${key}"; showing the key.`);
}
