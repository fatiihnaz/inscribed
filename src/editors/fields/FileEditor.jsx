"use client";

/**
 * @file Editor for the `File` block (via `FieldEditor`) and the `File`
 * collection field (via `CollectionFieldsForm`). Value is a fixed-shape
 * `{ url, name, mime, size }`.
 *
 * Two ways in. An upload knows the file's own type and size and fills all four;
 * a typed address (a document on a corporate server, a video link) leaves
 * `mime` empty and `size` null. Typed addresses are not probed for them: the
 * servers such links point at almost never let a browser read their headers,
 * and fetching an editor-typed URL from the backend is an SSRF surface bought
 * for mostly empty answers.
 *
 * Styled portably: neutral mid-gray alphas + `currentColor` (no drawer tokens),
 * and CSS transitions instead of framer-motion, so it reads on both the dark
 * admin drawer and a light host page (CollectionComposer).
 */

import { useCallback, useRef, useState } from "react";

import { useFileUpload } from "../use-file-upload.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { FileText, Link as LinkIcon, Trash2, TypeShortText, Upload } from "../../shared/style/icons.jsx";
import { FieldMessage } from "../FieldMessage.jsx";
import { FIELD_BG, FIELD_HOVER, FIELD_LINE } from "../field-css.js";
import { fieldVariant } from "../styles.js";
import { fileMeta } from "../../shared/util/file.js";
import { looksLikeAddress, safeHref } from "../../shared/util/url.js";
import { dynamicSize } from "../../shared/style/tokens.js";

/**
 * @typedef {Object} FileValue
 * @property {string} url
 * @property {string} name
 * @property {string} mime        Empty when unknown.
 * @property {number|null} size   Bytes; null when unknown.
 */

/**
 * @param {Object} props
 * @param {Partial<FileValue>|null|undefined} props.value
 * @param {(value: FileValue) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {import("../styles.js").FieldVariantName} [props.variant]
 */
export function FileEditor({ value, onChange, disabled, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const obj = value && typeof value === "object" ? value : {};
  const url = typeof obj.url === "string" ? obj.url : "";
  const name = typeof obj.name === "string" ? obj.name : "";
  const mime = typeof obj.mime === "string" ? obj.mime : "";
  const size = typeof obj.size === "number" ? obj.size : null;

  const { upload, isUploading, progress, error: uploadError } = useFileUpload();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const handleFile = useCallback(
    /** @param {File} file */
    async (file) => {
      const next = await upload(file);
      // A title someone typed outlives the file it was given to: swapping the
      // attachment is not retitling it. Only an untitled field takes the
      // filename.
      if (next) onChange(name ? { ...next, name } : next);
    },
    [upload, onChange, name],
  );

  const onDrop = (/** @type {React.DragEvent} */ e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // What the file is, as against what it has been called. The two sit one above
  // the other because the title is the editor's and this line is not.
  const meta = fileMeta({ url, mime, size });
  // The address can be typed now, so a stored `javascript:` would run in the
  // panel of whichever editor clicked "open". An address that fails the check
  // gets no link at all rather than an inert one.
  const openHref = safeHref(url);
  const suspect = url.trim().length > 0 && !looksLikeAddress(url);

  return (
    <div style={shellStyle}>
      <div
        onDrop={disabled ? undefined : onDrop}
        onDragOver={disabled ? undefined : (e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={disabled ? undefined : () => setIsDragging(false)}
      >
        {url ? (
          <div
            className={`inscribed-file-frame ${isDragging ? "is-dragging" : ""}`.trim()}
            style={frameStyle}
          >
            <div style={rowStyle}>
              <span aria-hidden="true" style={rowIconStyle}><FileText size={17} /></span>
              <span style={rowTextStyle}>
                <span style={rowNameStyle}>{name || t("editors.file.untitled")}</span>
                {meta ? <span style={rowMetaStyle}>{meta}</span> : null}
              </span>
              {isUploading ? (
                <div style={uploadScrimStyle}>
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: `${progress}%` }} />
                  </div>
                  <span style={scrimHintStyle}>
                    {progress < 100
                      ? t("editors.file.uploading", { percent: progress })
                      : t("editors.file.processing")}
                  </span>
                </div>
              ) : null}
            </div>
            <div style={actionsStyle}>
              {/* Stays for a read-only editor: looking at the attachment is not
                  editing it. */}
              {openHref ? (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inscribed-file-action"
                >
                  <Upload size={12} style={openIconStyle} />
                  {t("editors.file.open")}
                </a>
              ) : null}
              {!disabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isUploading}
                    className="inscribed-file-action"
                  >
                    <Upload size={12} />
                    {t("editors.file.replace")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ url: "", name: "", mime: "", size: null })}
                    disabled={isUploading}
                    className="inscribed-file-action is-destructive"
                  >
                    <Trash2 size={12} />
                    {t("editors.file.remove")}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : disabled ? (
          <div style={placeholderStyle}>{t("editors.file.empty")}</div>
        ) : (
          <button
            type="button"
            onClick={() => !isUploading && inputRef.current?.click()}
            className={`inscribed-dropzone ${v.className} ${isDragging ? "is-dragging" : ""}`.trim()}
            style={{ ...dropzoneStyle, cursor: isUploading ? "default" : "pointer" }}
          >
            {isUploading ? (
              <div style={dropzoneProgressStyle}>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${progress}%` }} />
                </div>
                <span style={hintStyle}>
                  {progress < 100
                    ? t("editors.file.uploading", { percent: progress })
                    : t("editors.file.processing")}
                </span>
              </div>
            ) : (
              <>
                <FileText size={20} style={dropzoneIconStyle} />
                <span style={hintStrongStyle}>
                  {isDragging ? t("editors.file.drop") : t("editors.file.upload")}
                </span>
                <span style={hintStyle}>{t("editors.file.uploadHint")}</span>
              </>
            )}
          </button>
        )}
      </div>

      {uploadError ? (
        <FieldMessage tone="danger" role="alert">{uploadError}</FieldMessage>
      ) : null}

      {/* Address and title as one framed pair, the shape the image and link
          fields use. Shown on an empty field too: the address box is how a
          document on another server or a video link gets in without an
          upload. */}
      <div className={`inscribed-field-group ${v.className}`.trim()}>
        <div>
          <span aria-hidden="true" style={groupIconStyle}><LinkIcon size={15} /></span>
          <input
            type="url"
            value={url}
            // The type and size described the uploaded file. A hand-edited
            // address points somewhere else, so they go rather than lie.
            onChange={(e) => onChange({ url: e.target.value, name, mime: "", size: null })}
            placeholder="https://…"
            spellCheck={false}
            aria-label={t("editors.file.url")}
            disabled={disabled}
            className={`inscribed-field ${v.className}`.trim()}
            style={groupInputStyle}
          />
        </div>
        <div>
          <span aria-hidden="true" style={groupIconStyle}><TypeShortText size={15} /></span>
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ url, mime, size, name: e.target.value })}
            placeholder={t("editors.file.namePlaceholder")}
            aria-label={t("editors.file.name")}
            disabled={disabled}
            className={`inscribed-field ${v.className}`.trim()}
            style={groupInputStyle}
          />
        </div>
      </div>

      {suspect ? <FieldMessage tone="warn">{t("editors.url.suspect")}</FieldMessage> : null}

      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---- Styles (neutral / portable) -------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 10 };

// Same gutter and dimming every other framed pair uses, so their text starts on
// one vertical.
const groupIconStyle = {
  position: "absolute",
  left: 12,
  top: "50%",
  marginTop: -7,
  display: "inline-flex",
  pointerEvents: "none",
  opacity: 0.4,
};

const groupInputStyle = { paddingLeft: 34 };

const dropzoneStyle = {
  width: "100%",
  minHeight: 116,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "16px 14px",
};

const dropzoneProgressStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  width: "100%",
};

const dropzoneIconStyle = { opacity: 0.6 };

const hintStrongStyle = { fontSize: dynamicSize(12), fontWeight: 500, opacity: 0.85 };
const hintStyle = { fontSize: dynamicSize(11), opacity: 0.5 };

const placeholderStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 92,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px dashed rgba(127,127,127,0.24)",
  borderRadius: 8,
  background: "rgba(127,127,127,0.03)",
  fontSize: dynamicSize(11),
  opacity: 0.5,
};

// One frame holding the file and what you can do to it, the shape a link field
// uses for its two halves.
const frameStyle = {
  width: "100%",
  // Nothing resets box-sizing for the SDK's own markup, and under content-box a
  // frame asked to fill its row lands 2px wider than the row.
  boxSizing: "border-box",
  border: `1px solid ${FIELD_LINE}`,
  borderRadius: 8,
  overflow: "hidden",
  background: FIELD_BG,
  transition: "border-color 140ms ease, background-color 140ms ease",
};

const rowStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 12px",
  background: FIELD_HOVER,
};

const rowIconStyle = { display: "inline-flex", flexShrink: 0, opacity: 0.55 };

const rowTextStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

// A CDN filename runs long and has no break opportunities, so it is clipped
// rather than allowed to widen the drawer.
const rowNameStyle = {
  fontSize: dynamicSize(12),
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowMetaStyle = {
  fontSize: dynamicSize(11),
  opacity: 0.5,
  fontVariantNumeric: "tabular-nums",
};

const uploadScrimStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "0 24px",
  background: "rgba(20, 18, 16, 0.62)",
  backdropFilter: "blur(2px)",
};

// White on the scrim, which is opaque enough to carry it whatever is behind.
const scrimHintStyle = {
  fontSize: dynamicSize(11),
  color: "rgba(255, 255, 255, 0.86)",
};

const actionsStyle = {
  display: "flex",
  gap: 4,
  padding: 5,
  borderTop: `1px solid ${FIELD_LINE}`,
};

// The upload glyph read upside down for "open": the same arrow, pointed at the
// file rather than away from it.
const openIconStyle = { transform: "rotate(180deg)" };

const progressTrackStyle = {
  width: "80%",
  height: 3,
  borderRadius: 99,
  background: "rgba(127,127,127,0.2)",
  overflow: "hidden",
};

const progressFillStyle = {
  height: "100%",
  borderRadius: 99,
  background: "currentColor",
  opacity: 0.55,
  transition: "width 300ms ease",
};
