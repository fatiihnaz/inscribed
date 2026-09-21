"use client";

/**
 * @file The toast an editor gets when their session dies under them (a refresh
 * answered 401: revoked, reuse-detected, or simply expired).
 *
 * Its own chunk rather than a part of `CmsProvider`, for the reason everything
 * else admin-shaped is: it reads the panel's wording, and the string catalogs
 * are a few hundred entries nobody without a session will ever see. It must
 * still render after the drawer has unmounted, so it is not in the drawer's
 * chunk either.
 */

import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { dynamicSize } from "../shared/style/tokens.js";

/**
 * @param {{ onSignIn: () => void, onDismiss: () => void }} props
 */
export function SessionExpiredNotice({ onSignIn, onDismiss }) {
  const t = useCmsStrings();
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "var(--ins-bg, #1c1815)",
        color: "var(--ins-text, #fff)",
        borderRadius: "var(--ins-radius, 10px)",
        fontFamily: "var(--ins-font-sans, system-ui, sans-serif)",
        fontSize: dynamicSize(13),
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      }}
    >
      <span>{t("core.session.expired")}</span>
      <button
        type="button"
        onClick={onSignIn}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "none",
          background: "var(--ins-accent, #c9b896)",
          color: "#1c1815",
          fontSize: dynamicSize(13),
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("core.session.signIn")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("translations.dismiss")}
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          opacity: 0.6,
          cursor: "pointer",
          fontSize: dynamicSize(16),
          lineHeight: 1,
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}
