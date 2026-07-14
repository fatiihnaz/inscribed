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

import { useImageUpload } from "../../hooks/use-image-upload.js";

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
 */
export function ImageEditor({ value, onChange, disabled }) {
  const obj = value && typeof value === "object" ? value : {};
  const src = typeof obj.src === "string" ? obj.src : "";
  const alt = typeof obj.alt === "string" ? obj.alt : "";
  /** @param {{ src?: string, alt?: string }} p */
  const patch = (p) => onChange({ src, alt, ...p });

  const { upload, reset, isUploading, progress, error: uploadError } = useImageUpload();
  const [isDragging, setIsDragging] = useState(false);
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
        {src && !isUploading ? (
          <div style={previewWrapStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} style={previewStyle} />
            {!disabled ? (
              <div style={previewActionsStyle}>
                <button type="button" onClick={() => inputRef.current?.click()} style={overlayBtnStyle}>
                  Değiştir
                </button>
                <button type="button" onClick={() => patch({ src: "" })} style={overlayBtnStyle}>
                  Kaldır
                </button>
              </div>
            ) : null}
          </div>
        ) : disabled ? (
          <div style={placeholderStyle}>Görsel yok</div>
        ) : (
          <button
            type="button"
            onClick={() => !isUploading && inputRef.current?.click()}
            style={{
              ...dropzoneStyle,
              ...(isDragging ? dropzoneActiveStyle : null),
              cursor: isUploading ? "default" : "pointer",
            }}
          >
            {isUploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${progress}%` }} />
                </div>
                <span style={hintStyle}>{progress < 100 ? `Yükleniyor ${progress}%` : "İşleniyor…"}</span>
              </div>
            ) : (
              <>
                <UploadIcon />
                <span style={hintStrongStyle}>{isDragging ? "Bırak" : "Görsel yükle"}</span>
                <span style={hintStyle}>tıkla veya sürükle-bırak</span>
              </>
            )}
          </button>
        )}
      </div>

      {uploadError ? (
        <div style={errorStyle} role="alert">
          <span style={{ flex: 1 }}>{uploadError}</span>
          <button
            type="button"
            onClick={reset}
            style={errorCloseStyle}
            aria-label="Hatayı kapat"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* src override + alt. The backend requires alt whenever src is set, so
          alt always shows alongside the URL box. */}
      <label style={subLabelStyle}>
        <span style={subLabelTextStyle}>Görsel URL</span>
        <input
          type="url"
          value={src}
          onChange={(e) => patch({ src: e.target.value })}
          placeholder="https://…"
          disabled={disabled}
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>
      <label style={subLabelStyle}>
        <span style={subLabelTextStyle}>Alt metin</span>
        <input
          type="text"
          value={alt}
          onChange={(e) => patch({ alt: e.target.value })}
          placeholder="Görseli tarif et"
          disabled={disabled}
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>

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

const dropzoneStyle = {
  width: "100%",
  minHeight: 116,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "16px 14px",
  border: "1.5px dashed rgba(127,127,127,0.3)",
  borderRadius: 8,
  background: "rgba(127,127,127,0.04)",
  color: "inherit",
  fontFamily: "inherit",
  transition: "border-color 140ms ease, background-color 140ms ease",
};
const dropzoneActiveStyle = {
  borderColor: "color-mix(in srgb, currentColor 45%, transparent)",
  background: "rgba(127,127,127,0.09)",
};
const hintStrongStyle = { fontSize: 12, fontWeight: 500, opacity: 0.85 };
const hintStyle = { fontSize: 11, opacity: 0.5 };
const placeholderStyle = {
  width: "100%",
  minHeight: 92,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px dashed rgba(127,127,127,0.24)",
  borderRadius: 8,
  background: "rgba(127,127,127,0.03)",
  fontSize: 11,
  opacity: 0.5,
};
const previewWrapStyle = { position: "relative", display: "inline-block", width: "100%" };
const previewStyle = {
  display: "block",
  width: "100%",
  maxHeight: 180,
  objectFit: "contain",
  borderRadius: 8,
  border: "1px solid rgba(127,127,127,0.22)",
  background: "rgba(127,127,127,0.04)",
};
const previewActionsStyle = { position: "absolute", top: 8, right: 8, display: "flex", gap: 6 };
const overlayBtnStyle = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(20,20,20,0.55)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  backdropFilter: "blur(6px)",
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
const errorStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 10px",
  fontSize: 12,
  color: "inherit",
  background: "rgba(220,60,80,0.08)",
  border: "1px solid rgba(220,60,80,0.32)",
  borderRadius: 7,
};
const errorCloseStyle = {
  background: "none",
  border: 0,
  color: "inherit",
  cursor: "pointer",
  padding: "0 2px",
  opacity: 0.6,
  fontSize: 13,
  lineHeight: 1,
  fontFamily: "inherit",
};
const subLabelStyle = { display: "flex", flexDirection: "column", gap: 5 };
const subLabelTextStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.01em",
  textTransform: "uppercase",
  opacity: 0.65,
};
const fieldStyle = {
  padding: "8px 10px",
  border: "1px solid rgba(127,127,127,0.22)",
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.4,
  fontFamily: "inherit",
  background: "rgba(127,127,127,0.04)",
  color: "inherit",
  outline: "none",
};
