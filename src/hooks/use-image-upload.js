"use client";

/**
 * @file `useImageUpload()`: shared image-upload flow (validate → CDN upload →
 * progress/error state) behind the config transport. Used by the drawer's
 * `ImageEditor` and the page-side `InlineImageOverlay` so both share one code
 * path. Returns `upload(file)` resolving to the CDN url (or null on failure);
 * callers decide how to fold it into their block value.
 */

import { useCallback, useState } from "react";

import { useCmsContext } from "../lib/context.js";

/**
 * @typedef {{ progress: number } | { error: string } | null} UploadState
 */

/**
 * @typedef {Object} UseImageUploadResult
 * @property {(file: File) => Promise<string | null>} upload
 * @property {() => void} reset   Clear a lingering error/progress.
 * @property {boolean} isUploading
 * @property {number} progress
 * @property {string | null} error
 */

/**
 * @returns {UseImageUploadResult}
 */
export function useImageUpload() {
  const { config, getAccessToken } = useCmsContext();
  const [state, setState] = useState(/** @type {UploadState} */ (null));

  const upload = useCallback(
    /**
     * @param {File} file
     * @returns {Promise<string | null>}
     */
    async (file) => {
      if (!file.type.startsWith("image/")) {
        setState({ error: "Lütfen bir görsel dosyası seçin." });
        return null;
      }
      setState({ progress: 0 });
      try {
        const token = (await getAccessToken?.()) ?? null;
        const result = await config.transport.uploadImage(file, {
          onProgress: (p) => setState({ progress: p }),
          accessToken: token,
        });
        const url = result?.data?.url;
        if (!url) throw new Error("CDN cevabında url bulunamadı");
        setState(null);
        return url;
      } catch (/** @type {any} */ err) {
        setState({ error: err?.message ?? "Yükleme başarısız." });
        return null;
      }
    },
    [config, getAccessToken],
  );

  const reset = useCallback(() => setState(null), []);

  const isUploading = state !== null && "progress" in state;
  return {
    upload,
    reset,
    isUploading,
    progress: isUploading ? /** @type {{ progress: number }} */ (state).progress : 0,
    error: state !== null && "error" in state ? state.error : null,
  };
}
