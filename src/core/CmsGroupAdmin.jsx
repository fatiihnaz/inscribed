"use client";

/**
 * @file The hover ring and label `<CmsGroup>` draws for an editor, reached
 * through a dynamic import. The prefix and visibility contexts the group exists
 * for are published by the public half and reach descendants either way.
 */

import { useState } from "react";

import { CHROME_ICON, regionChipStyle } from "./page-region-chrome.js";
import { TypeGroup } from "../shared/style/icons.jsx";
import { ACCENT, ROOMY_INSET } from "../shared/style/tokens.js";
import { useCmsStrings } from "./hooks/use-cms-strings.js";

const RING_COLOR_HOVER = `color-mix(in srgb, ${ACCENT} 50%, transparent)`;
const RING_COLOR_OFF   = `color-mix(in srgb, ${ACCENT} 0%, transparent)`;
// The dashed outline sits this far outside the group box; the label straddles it
// and it must clear the children's halos so the group wraps them.
const GROUP_OFFSET     = ROOMY_INSET + 4;

/**
 * @param {{
 *   prefix: string,
 *   visibility: "hidden" | "readonly" | null,
 *   style?: React.CSSProperties,
 *   children: React.ReactNode,
 * }} props
 */
export function CmsGroupAdmin({ prefix, visibility, style, children }) {
  const t = useCmsStrings();
  const [hovered, setHovered] = useState(false);

  const modeLabel = visibility === "hidden" ? t("core.group.hidden")
    : visibility === "readonly" ? t("block.readOnly")
    : null;
  const label = modeLabel ? `${prefix} · ${modeLabel}` : prefix;

  return (
    <div
      data-cms-group={prefix}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        outline: `1.5px dashed ${hovered ? RING_COLOR_HOVER : RING_COLOR_OFF}`,
        outlineOffset: GROUP_OFFSET,
        borderRadius: 12,
        transition: "outline-color 0.18s ease",
        ...style,
      }}
    >
      {children}
      {hovered ? (
        <span
          aria-hidden="true"
          style={{
            // The same glass pill every other page-side label is drawn on;
            // only the anchoring is the group's own, since its dashed ring
            // sits further out than a region's halo.
            ...regionChipStyle({ roomy: true, highlight: false, accent: ACCENT }),
            // Straddle the outline's top line at the right, so it sits on the
            // dashed line and clears the child block chips (which sit top-left).
            top: -GROUP_OFFSET,
            left: "auto",
            right: 8 - GROUP_OFFSET,
            pointerEvents: "none",
          }}
        >
          <TypeGroup size={CHROME_ICON} style={{ flexShrink: 0, opacity: 0.8 }} />
          {label}
        </span>
      ) : null}
    </div>
  );
}
