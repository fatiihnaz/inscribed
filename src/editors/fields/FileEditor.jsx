"use client";

/**
 * @file Upload editor for the `File` block (via `FieldEditor`) and the `File`
 * collection field (via `CollectionFieldsForm`). Value is a fixed-shape
 * `{ url, name, mime, size }`.
 *
 * There is no address box, and that is the type's whole premise: every value
 * here came from an upload that knew the file's own type and size, so the three
 * halves beside the url are always filled and a consumer never has to render
 * around a missing one. Pointing at a file already on the CDN means uploading
 * it again.
 *
 * Styled portably: neutral mid-gray alphas + `currentColor` (no drawer tokens),
 * and CSS transitions instead of framer-motion, so it reads on both the dark
 * admin drawer and a light host page (CollectionComposer).
 */

import { useCallback, useRef, useState } from "react";

import { useFileUpload } from "../use-file-upload.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { FileText, Trash2, TypeShortText, Upload } from "../../shared/style/icons.jsx";
import { FieldMessage } from "../FieldMessage.jsx";
import { FIELD_BG, FIELD_HOVER, FIELD_LINE } from "../field-css.js";
import { fieldVariant } from "../styles.js";
import { fileKindLabel, formatBytes } from "../../shared/util/file.js";
import { dynamicSize } from "../../shared/style/tokens.js";

/**
 * @typedef {import("../use-file-upload.js").FileValue} FileValue
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
  const size = typeof obj.size === "number" ? obj.size : 0;

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
  const meta = [fileKindLabel(mime), formatBytes(size)].filter(Boolean).join(" · ");

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
              {/* The one way to see where the file landed, now that no address
                  box shows it. Stays for a read-only editor: looking at the
                  attachment is not editing it. */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inscribed-file-action"
              >
                <Upload size={12} style={openIconStyle} />
                {t("editors.file.open")}
              </a>
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
                    onClick={() => onChange({ url: "", name: "", mime: "", size: 0 })}
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

      {/* Only once there is a file: a title box over an empty field names
          nothing, and the dropzone above is the only thing to do there. Framed
          like the link and image pairs even at one row, so a titled file sits
          on the same vertical as every other framed field in the drawer. */}
      {url ? (
        <div className={`inscribed-field-group ${v.className}`.trim()}>
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
      ) : null}

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
