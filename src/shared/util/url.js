/**
 * @file Address checks shared by the editors that hold one.
 */

/**
 * Whether a string reads as somewhere you can go.
 *
 * Same-site addresses are the point: a CMS link is as often `/hakkimizda` as it
 * is a full URL, so anything starting a path, a fragment or a query counts.
 * Everything else has to parse as an absolute URL, which is what catches the two
 * common slips: a missing scheme (`example.com`) and a mistyped one (`htp://…`).
 *
 * Advisory only. Callers warn, they do not refuse: a field holds whatever the
 * site actually needs, and rejecting a working address nobody anticipated would
 * be worse than showing a wrong-looking one.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function looksLikeAddress(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/^[/#?]/.test(trimmed)) return true;
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}
