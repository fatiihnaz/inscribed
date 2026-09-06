"use client";

/**
 * @file Image upload editor shared by the CMS Image block (via `FieldEditor`)
 * and the `Image` collection field (via `CollectionFieldsForm`). Value is a
 * fixed-shape `{ src, alt }` object.
 *
 * Styled portably: neutral mid-gray alphas + `currentColor` (no drawer tokens),
 * and CSS transitions instead of framer-motion, so it reads on both the dark
 * admin drawer and a light host page (CollectionComposer) and doesn't pull
 * framer-motion into the shared collections chunk. Buttons that sit ON the
 * image use a dark scrim + white text, which is safe over any image.
 */

import { useCallback, useRef, useState } from "react";

import { useImageUpload } from "../use-image-upload.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { Link as LinkIcon, Trash2, TypeShortText, Upload } from "../../shared/style/icons.jsx";
import { FieldMessage } from "../FieldMessage.jsx";
import { FIELD_BG, FIELD_HOVER, FIELD_LINE } from "../field-css.js";
import { fieldVariant } from "../styles.js";
import { dynamicSize } from "../../shared/style/tokens.js";

/**
 * @typedef {Object} ImageValue
 * @property {string} [src]
 * @property {string} [alt]
 */

/**
 * @param {Object} props
 * @param {ImageValue|null|undefined} props.value
 * @param {(value: { src: string, alt: string }) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {import("../styles.js").FieldVariantName} [props.variant]
 */
export function ImageEditor({ value, onChange, disabled, variant }) {
  const t = useCmsStrings();
  const v = fieldVariant(variant);
  const obj = value && typeof value === "object" ? value : {};
  const src = typeof obj.src === "string" ? obj.src : "";
  const alt = typeof obj.alt === "string" ? obj.alt : "";
  /** @param {{ src?: string, alt?: string }} p */
  const patch = (p) => onChange({ src, alt, ...p });

  const { upload, isUploading, progress, error: uploadError } = useImageUpload();
  const [isDragging, setIsDragging] = useState(false);
  // Read off the decoded image rather than asked of the backend. Which pixels
  // a field actually holds is the thing you cannot tell from a scaled preview,
  // and it is the usual reason a picture looks wrong on the page.
  const [size, setSize] = useState(/** @type {{ w: number, h: number } | null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const handleFile = useCallback(
    /** @param {File} file */
    async (file) => {
      // Preserve any alt already typed; only src changes on upload.
      const url = await upload(file);
      if (url) onChange({ src: url, alt });
    },
    [upload, onChange, alt],
  );

  const onDrop = (/** @type {React.DragEvent} */ e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div style={shellStyle}>
      <div
        onDrop={disabled ? undefined : onDrop}
        onDragOver={disabled ? undefined : (e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={disabled ? undefined : () => setIsDragging(false)}
      >
        {src ? (
          <div
            className={`inscribed-image-frame ${isDragging ? "is-dragging" : ""}`.trim()}
            style={previewWrapStyle}
          >
            {/* The floor only applies while uploading: with the stage now sized by
                the picture, a thin banner left the progress readout no room and
                the frame clipped it. */}
            <div style={isUploading ? { ...stageStyle, minHeight: 96 } : stageStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                style={previewStyle}
                onLoad={(e) => setSize({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })}
              />
              {/* A replace keeps the picture underneath: swapping it for the
                  empty dropzone changed the field's height mid-upload and took
                  away the one thing that said what was being replaced. */}
              {isUploading ? (
                <div style={uploadScrimStyle}>
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: `${progress}%` }} />
                  </div>
                  <span style={scrimHintStyle}>
                    {progress < 100
                      ? t("editors.image.uploading", { percent: progress })
                      : t("editors.image.processing")}
                  </span>
                </div>
              ) : null}
            </div>
            {!disabled ? (
              <div style={previewActionsStyle}>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isUploading}
                  className="inscribed-image-action"
                >
                  <Upload size={12} />
                  {t("editors.image.replace")}
                </button>
                <button
                  type="button"
                  onClick={() => { setSize(null); patch({ src: "" }); }}
                  disabled={isUploading}
                  className="inscribed-image-action is-destructive"
                >
                  <Trash2 size={12} />
                  {t("editors.image.remove")}
                </button>
              </div>
            ) : null}
          </div>
        ) : disabled ? (
          <div style={placeholderStyle}>{t("editors.image.empty")}</div>
        ) : (
          <button
            type="button"
            onClick={() => !isUploading && inputRef.current?.click()}
            className={`inscribed-dropzone ${v.className} ${isDragging ? "is-dragging" : ""}`.trim()}
            style={{ ...dropzoneStyle, cursor: isUploading ? "default" : "pointer" }}
          >
            {isUploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${progress}%` }} />
                </div>
                <span style={hintStyle}>
                  {progress < 100
                    ? t("editors.image.uploading", { percent: progress })
                    : t("editors.image.processing")}
                </span>
              </div>
            ) : (
              <>
                <UploadIcon />
                <span style={hintStrongStyle}>
                  {isDragging ? t("editors.image.drop") : t("editors.image.upload")}
                </span>
                <span style={hintStyle}>{t("editors.image.uploadHint")}</span>
              </>
            )}
          </button>
        )}
      </div>

      {uploadError ? (
        <FieldMessage tone="danger" role="alert">{uploadError}</FieldMessage>
      ) : size ? (
        <FieldMessage>{`${size.w} × ${size.h}`}</FieldMessage>
      ) : null}

      {/* Address and alt text: two inputs that are halves of one value, so they
          take the framed pair `LinkEditor` uses rather than two captioned
          fields stacked. The card above already names the field; a glyph in the
          gutter is enough to say which half is which, and it keeps the drawer
          down to one label language. The backend requires alt whenever src is
          set, so alt always shows alongside the URL box. */}
      <div className={`inscribed-field-group ${v.className}`.trim()}>
        <div>
          <span aria-hidden="true" style={groupIconStyle}><LinkIcon size={15} /></span>
          <input
            type="url"
            value={src}
            onChange={(e) => patch({ src: e.target.value })}
            placeholder="https://…"
            aria-label={t("editors.image.url")}
            disabled={disabled}
            className={`inscribed-field ${v.className}`.trim()}
            style={groupInputStyle}
          />
        </div>
        <div>
          <span aria-hidden="true" style={groupIconStyle}><TypeShortText size={15} /></span>
          <input
            type="text"
            value={alt}
            onChange={(e) => patch({ alt: e.target.value })}
            placeholder={t("editors.image.altPlaceholder")}
            aria-label={t("editors.image.alt")}
            disabled={disabled}
            className={`inscribed-field ${v.className}`.trim()}
            style={groupInputStyle}
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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

function UploadIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.6 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

// ---- Styles (neutral / portable) -------------------------------------------

const shellStyle = { display: "flex", flexDirection: "column", gap: 10 };

// Same gutter and dimming the link and date fields use, so every framed pair in
// the product starts its text on the same vertical.
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
// One frame holding the picture and what you can do to it, the way a link field
// frames its two halves. The buttons used to float in the image's top-right
// corner over a dark scrim, which put them on top of the content and left them
// legible only by luck: a pale photo swallowed them.
const previewWrapStyle = {
  width: "100%",
  // Nothing resets box-sizing for the SDK's own markup, so under content-box a
  // frame asked to fill its row landed 2px wider than the row and its right
  // border was clipped off by whatever contained it.
  boxSizing: "border-box",
  border: `1px solid ${FIELD_LINE}`,
  borderRadius: 8,
  overflow: "hidden",
  background: FIELD_BG,
  transition: "border-color 140ms ease, background-color 140ms ease",
};

// The stage takes the picture's height rather than holding a fixed one: a fixed
// stage letterboxed every wide image, and dead bands above and below a banner
// cost more than the steadier form rhythm bought. The cap is what keeps a tall
// portrait from pushing the fields under it off screen; only that case is
// centred, and only sideways.
const stageStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: FIELD_HOVER,
};
const previewStyle = {
  display: "block",
  maxWidth: "100%",
  maxHeight: 200,
  objectFit: "contain",
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
// Both buttons take the width evenly, so neither reads as the safer one.
const previewActionsStyle = {
  display: "flex",
  gap: 4,
  padding: 5,
  borderTop: `1px solid ${FIELD_LINE}`,
};
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

