"use client";

/**
 * @file `<InlineImagePlaceholder>`: on-page drop-zone for an *empty* Image
 * block in admin mode. An empty block has no `<img>` to hover, so instead of the
 * bare "-" marker this renders the same upload dropzone as the drawer's
 * `ImageEditor` (click or drag to upload); URL/alt entry stays in the drawer,
 * reached via the label chip.
 *
 * Neutral gray + currentColor tones so it reads on a light or dark page.
 */

import { useRef, useState } from "react";

import { useImageUpload } from "../hooks/use-image-upload.js";

/**
 * @param {Object} props
 * @param {(value: { src: string, alt: string }) => void} props.onChange
 * @param {React.CSSProperties} [props.style] Consumer box style (width, radius…).
 */
export function InlineImagePlaceholder({ onChange, style }) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const { upload, isUploading, progress, error } = useImageUpload();
  const [isDragging, setIsDragging] = useState(false);

  /** @param {File} file */
  const handleFile = async (file) => {
    const url = await upload(file);
    if (url) onChange({ src: url, alt: "" });
  };

  return (
    <button
      type="button"
      onClick={() => !isUploading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      style={{
        ...style,
        boxSizing: "border-box",
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "20px 16px",
        border: `1.5px dashed ${isDragging ? "color-mix(in srgb, currentColor 45%, transparent)" : "rgba(127,127,127,0.3)"}`,
        borderRadius: style?.borderRadius ?? 8,
        background: isDragging ? "rgba(127,127,127,0.09)" : "rgba(127,127,127,0.04)",
        color: "inherit",
        fontFamily: "inherit",
        cursor: isUploading ? "default" : "pointer",
        transition: "border-color 140ms ease, background-color 140ms ease",
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
          {error ? <span style={errorTextStyle}>{error}</span> : null}
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </button>
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

const hintStrongStyle = { fontSize: 12.5, fontWeight: 500, opacity: 0.85 };
const hintStyle = { fontSize: 11, opacity: 0.5 };
const errorTextStyle = { fontSize: 11.5, marginTop: 2, color: "rgb(200,70,80)" };
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
