"use client";

/**
 * @file `<InlineImageOverlay>`: on-image edit affordance for a filled Image
 * block. Details (alt text, URL) live in the drawer, reached via the label
 * chip; this surface is just the quick replace/remove.
 *
 * It is the same ink row a region's actions ride on, anchored inside the
 * picture rather than on a ring line: translucent and blurred, so it reads over
 * any photograph without a scrim of its own.
 *
 * The root is `pointer-events: none` so hover and a click on the bare image
 * still reach it (opening the drawer); only the button group opts back in.
 * EditableRegion renders this only when the image is large enough to hold it.
 */

import { useEffect, useRef } from "react";

import { useImageUpload } from "../use-image-upload.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { Trash2, Upload } from "../../shared/style/icons.jsx";
import {
  CHROME_ICON, CHROME_STROKE, INK_BTN_CLASS, INK_SURFACE,
  ensureInkChromeStyle, inkDividerStyle, inkRowStyle, regionActionButtonStyle,
} from "../../core/page-region-chrome.js";
import {
  FONT_SANS, FS_XS, STATUS_DANGER, TEXT_HI, R_SM,
} from "../../shared/style/tokens.js";

/**
 * @param {Object} props
 * @param {{ src?: string, alt?: string } | null} props.value
 * @param {(value: { src: string, alt: string }) => void} props.onChange
 */
export function InlineImageOverlay({ value, onChange }) {
  const t = useCmsStrings();
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const { upload, isUploading, progress, error } = useImageUpload();
  const alt = value?.alt ?? "";

  useEffect(() => {
    ensureInkChromeStyle();
  }, []);

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
          className={INK_BTN_CLASS}
          style={regionActionButtonStyle({ accent: TEXT_HI })}
          title={t("editors.image.replace")}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          <Upload size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
          {t("editors.image.replace")}
        </button>
        {value?.src ? (
          <>
            {/* Same rule the list row draws before its delete. */}
            <span aria-hidden="true" style={inkDividerStyle} />
            <button
              type="button"
              className={INK_BTN_CLASS}
              style={regionActionButtonStyle({ accent: STATUS_DANGER })}
              title={t("editors.image.remove")}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ src: "", alt });
              }}
            >
              {/* The list row's delete icon, so the two surfaces read as one
                  vocabulary. */}
              <Trash2 size={CHROME_ICON} strokeWidth={CHROME_STROKE} />
              {t("editors.image.remove")}
            </button>
          </>
        ) : null}
      </span>

      {isUploading ? (
        <span style={progressStyle}>
          {progress < 100
            ? t("editors.image.uploading", { percent: progress })
            : t("editors.image.processing")}
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

// The row a region's actions ride on, re-anchored: this one sits inside the
// picture rather than on a ring line.
const actionsStyle = /** @type {React.CSSProperties} */ ({
  ...inkRowStyle,
  position: "absolute",
  top: 8,
  right: 8,
  pointerEvents: "auto",
});

const progressStyle = /** @type {React.CSSProperties} */ ({
  ...INK_SURFACE,
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: TEXT_HI,
  fontFamily: FONT_SANS,
  fontSize: FS_XS,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
});

const errorStyle = /** @type {React.CSSProperties} */ ({
  ...INK_SURFACE,
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 8,
  padding: "5px 8px",
  borderRadius: R_SM,
  color: STATUS_DANGER,
  fontFamily: FONT_SANS,
  fontSize: FS_XS,
  fontWeight: 500,
});
