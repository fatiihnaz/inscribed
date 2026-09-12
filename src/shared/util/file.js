/**
 * @file Display helpers for a `File` block's stored metadata, shared by the
 * drawer editor, the changes panel and the page-side render so all three say a
 * size and a format the same way.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/**
 * Human size for a byte count.
 *
 * One decimal above a kilobyte and none below or past three digits: "1.0 KB"
 * is a false precision on a small file, and "245.3 MB" spends a digit on
 * something nobody reads. Binary units, matching what an OS file listing shows
 * for the same file.
 *
 * @param {number} bytes
 * @returns {string|null} Null when the count is not a usable number.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}

/**
 * The media types whose registry string names the standard rather than the
 * format: nothing in `vnd.openxmlformats-officedocument.wordprocessingml.document`
 * spells DOCX, and the generic rule below would read it as "DOCUMENT".
 */
const KIND_BY_MIME = {
  "application/pdf": "PDF",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "application/gzip": "GZIP",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "text/markdown": "MD",
};

/**
 * Short badge for a media type: the bit a human reads off a file, not the
 * registry string. `application/pdf` -> "PDF", `image/svg+xml` -> "SVG".
 *
 * Null on an empty type, which is what a browser reports for an extension it
 * does not recognise. The row then shows the size alone rather than a badge
 * naming nothing.
 *
 * @param {string} mime
 * @returns {string|null}
 */
export function fileKindLabel(mime) {
  if (typeof mime !== "string" || !mime) return null;
  const clean = mime.split(";")[0].trim().toLowerCase();
  if (KIND_BY_MIME[clean]) return KIND_BY_MIME[clean];
  const subtype = clean.split("/")[1] ?? "";
  // The suffix and the vendor prefix qualify the format rather than name it:
  // `svg+xml` is an SVG, `x-tar` a TAR.
  const bare = subtype.split("+")[0].replace(/^x-/, "");
  return bare ? bare.slice(0, 8).toUpperCase() : null;
}
