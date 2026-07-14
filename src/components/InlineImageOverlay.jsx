"use client";

/**
 * @file `<InlineImageOverlay>`: on-image edit affordance for a filled Image
 * block. A semi-transparent scrim with "Değiştir" / "Kaldır" sits over the top
 * of the image (dark scrim + white text reads on any picture, same treatment as
 * ImageEditor's preview). Details (alt text, URL) live in the drawer, reached
 * via the label chip; this surface is just the quick replace/remove.
 *
 * The root is `pointer-events: none` so hover and a click on the bare image
 * still reach it (opening the drawer); only the button group opts back in.
 * EditableRegion renders this only when the image is large enough to hold it.
 */

import { useRef } from "react";

import { useImageUpload } from "../hooks/use-image-upload.js";

/**
 * @param {Object} props
 * @param {{ src?: string, alt?: string } | null} props.value
 * @param {(value: { src: string, alt: string }) => void} props.onChange
 */
export function InlineImageOverlay({ value, onChange }) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const { upload, isUploading, progress, error } = useImageUpload();
  const alt = value?.alt ?? "";

  /** @param {File} file */
  const handleFile = async (file) => {
    const url = await upload(file);
    if (url) onChange({ src: url, alt });
  };

  return (
    <span style={rootStyle} aria-hidden="true">
      <span style={actionsStyle}>
        <button
          type="button"
          style={btnStyle}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Değiştir
        </button>
        {value?.src ? (
          <button
            type="button"
            style={btnStyle}
            onClick={(e) => {
              e.stopPropagation();
              onChange({ src: "", alt });
            }}
          >
            Kaldır
          </button>
        ) : null}
      </span>

      {isUploading ? (
        <span style={progressStyle}>
          {progress < 100 ? `Yükleniyor ${progress}%` : "İşleniyor…"}
        </span>
      ) : null}
      {error ? <span style={errorStyle}>{error}</span> : null}

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
    </span>
  );
}

const rootStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  display: "block",
});

const actionsStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  top: 8,
  right: 8,
  display: "flex",
  gap: 6,
  pointerEvents: "auto",
});

// Copied from ImageEditor's overlay buttons: dark scrim + white, safe on any image.
const btnStyle = /** @type {React.CSSProperties} */ ({
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
});

const progressStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(20,20,20,0.45)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
});

const errorStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 8,
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(180,40,50,0.85)",
  color: "#fff",
  fontSize: 11,
});
