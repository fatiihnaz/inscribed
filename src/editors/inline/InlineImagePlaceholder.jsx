"use client";

/**
 * @file `<InlineImagePlaceholder>`: on-page drop-zone for an *empty* Image
 * block in admin mode. An empty block has no `<img>` to hover, so instead of the
 * bare "-" marker this renders an upload dropzone (click or drag); URL/alt entry
 * stays in the drawer, reached via the label chip.
 *
 * Dashed accent, like the list's add slot: on this page that is the shape a
 * place-something-goes takes.
 */

import { useRef, useState } from "react";

import { useImageUpload } from "../use-image-upload.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { Upload } from "../../shared/style/icons.jsx";
import {
  ACCENT, DUR_FAST, EASE, STATUS_DANGER, RING_RADIUS, R_PILL,
} from "../../shared/style/tokens.js";

/**
 * @param {Object} props
 * @param {(value: { src: string, alt: string }) => void} props.onChange
 * @param {React.CSSProperties} [props.style] Consumer box style (width, radius…).
 */
export function InlineImagePlaceholder({ onChange, style }) {
  const t = useCmsStrings();
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
        border: `1.5px dashed color-mix(in srgb, ${ACCENT} ${isDragging ? 70 : 30}%, transparent)`,
        borderRadius: style?.borderRadius ?? RING_RADIUS,
        background: `color-mix(in srgb, ${ACCENT} ${isDragging ? 10 : 4}%, transparent)`,
        color: "inherit",
        fontFamily: "inherit",
        cursor: isUploading ? "default" : "pointer",
        transition: `border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE}`,
      }}
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
          <Upload size={20} strokeWidth={1.75} style={{ opacity: 0.6 }} />
          <span style={hintStrongStyle}>
            {isDragging ? t("editors.image.drop") : t("editors.image.upload")}
          </span>
          <span style={hintStyle}>{t("editors.image.uploadHint")}</span>
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

const hintStrongStyle = { fontSize: 12.5, fontWeight: 500, opacity: 0.85 };
const hintStyle = { fontSize: 11, opacity: 0.5 };
const errorTextStyle = { fontSize: 11.5, marginTop: 2, color: STATUS_DANGER };
const progressTrackStyle = {
  width: "80%",
  height: 3,
  borderRadius: R_PILL,
  background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`,
  overflow: "hidden",
};
const progressFillStyle = {
  height: "100%",
  borderRadius: R_PILL,
  background: ACCENT,
  transition: `width 300ms ${EASE}`,
};
