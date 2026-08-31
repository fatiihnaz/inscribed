"use client";

/**
 * @file `DetailPane`: the full-height pane that slides in over the row list,
 * shared by the edit and create lanes. Back header on top, scrollable body,
 * optional pinned action footer.
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft } from "../../shared/style/icons.jsx";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import {
  PANE_EXIT_TRANSITION, detailPaneStyle, detailHeaderStyle, paneBackStyle,
  detailTitleStyle, detailBodyStyle, detailFooterStyle,
} from "./collection-styles.js";

/**
 * Full-height pane sliding in from the right over the row list. Back header on
 * top, scrollable body, optional pinned action footer. Escape goes back.
 *
 * @param {{
 *   onBack: () => void,
 *   title: string,
 *   titleContent?: React.ReactNode,
 *   meta?: React.ReactNode,
 *   footer?: React.ReactNode,
 *   children: React.ReactNode,
 * }} props
 *   `titleContent` replaces the heading itself while `title` stays the plain
 *   string the pane is labelled by, so a heading that turns into an input still
 *   announces the record it belongs to. Passing it as `null` (rather than
 *   omitting it) says the pane carries its identity below the header instead,
 *   which is what the edit lane does with its record card.
 */
export function DetailPane({ onBack, title, titleContent, meta, subhead, footer, children }) {
  const t = useCmsStrings();
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={PANE_EXIT_TRANSITION}
      style={detailPaneStyle}
      role="region"
      aria-label={title}
    >
      <header style={detailHeaderStyle}>
        <button
          type="button"
          onClick={onBack}
          className="inscribed-pane-back"
          style={paneBackStyle}
          title={t("collections.backToListTitle")}
        >
          <ChevronLeft size={14} />
          {t("collections.backToList")}
        </button>
        {titleContent !== undefined
          ? titleContent
          : <span style={detailTitleStyle} title={title}>{title}</span>}
        {meta}
      </header>
      {subhead}
      <div style={detailBodyStyle}>{children}</div>
      {footer ? <footer style={detailFooterStyle}>{footer}</footer> : null}
    </motion.div>
  );
}
