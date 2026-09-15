"use client";

/**
 * @file `useFileUpload()`: the upload flow behind `transport.uploadFile`, used
 * by the drawer's `FileEditor`.
 *
 * Resolves to the whole `File` block value rather than a bare url, which is why
 * it is not `useImageUpload` with the type check taken out: `name`, `mime` and
 * `size` are knowable only from the local `File`, so the one place holding it
 * is the only one that can record them.
 */

import { useCallback, useState } from "react";

import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";

/**
 * @typedef {{ progress: number } | { error: string } | null} UploadState
 */

/**
 * What an upload produces. Unlike a typed address it always knows the type
 * and size, which is why this is narrower than the editor's own value type.
 *
 * @typedef {Object} UploadedFile
 * @property {string} url    Where the file now lives.
 * @property {string} name   Seeded from the filename; the editor's to retitle.
 * @property {string} mime   The browser's own reading, empty for an extension it does not know.
 * @property {number} size   Bytes.
 */

/**
 * @typedef {Object} UseFileUploadResult
 * @property {(file: File) => Promise<UploadedFile | null>} upload
 * @property {() => void} reset   Clear a lingering error/progress.
 * @property {boolean} isUploading
 * @property {number} progress
 * @property {string | null} error
 */

/**
 * @returns {UseFileUploadResult}
 */
export function useFileUpload() {
  const { config, getAccessToken } = useCmsContext();
  const t = useCmsStrings();
  const [state, setState] = useState(/** @type {UploadState} */ (null));

  const upload = useCallback(
    /**
     * @param {File} file
     * @returns {Promise<UploadedFile | null>}
     */
    async (file) => {
      // Said by name rather than quietly routed through `uploadImage`: a
      // transport written before this method has no file endpoint at all, and
      // falling back would hand a PDF to whatever its image pipeline does with
      // one.
      if (typeof config.transport?.uploadFile !== "function") {
        setState({ error: t("editors.upload.noFileTransport") });
        return null;
      }
      // No type check of any kind: the field holds a file, and which ones a
      // site accepts is the backend's rule to state, not a list the SDK can
      // guess at.
      setState({ progress: 0 });
      try {
        const token = (await getAccessToken?.()) ?? null;
        const result = await config.transport.uploadFile(file, {
          onProgress: (p) => setState({ progress: p }),
          accessToken: token,
        });
        const url = result?.data?.url;
        if (!url) throw new Error(t("editors.upload.noUrl"));
        setState(null);
        return { url, name: file.name, mime: file.type, size: file.size };
      } catch (/** @type {any} */ err) {
        setState({ error: err?.message ?? t("editors.upload.failed") });
        return null;
      }
    },
    [config, getAccessToken, t],
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
