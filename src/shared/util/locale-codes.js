/**
 * @file How a set of languages is named in a label: "TR + EN".
 */

/**
 * @param {Iterable<string>} locales
 * @returns {string}
 */
export function localeCodes(locales) {
  return [...locales].map((l) => l.toUpperCase()).join(" + ");
}
