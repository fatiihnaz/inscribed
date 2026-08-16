"use client";

/**
 * @file `<CmsGroup name>`: declarative section wrapper doing two things.
 *
 *   1. Prefixes descendant blockPaths. A `<EditableRegion blockPath="x">`
 *      inside `<CmsGroup name="hero">` reads/writes "hero.x"; nested groups
 *      concat with dots. Discovery applies the same prefix on the manifest
 *      side, so the consumer never repeats the group name.
 *
 *   2. In admin mode, draws a dashed ring + label around its children on
 *      hover. Public mode is a transparent passthrough.
 */

import { useContext, useState } from "react";

import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../shared/state/group-context.js";
import { regionChipStyle } from "./page-region-chrome.js";
import { ACCENT, ROOMY_INSET } from "../shared/style/tokens.js";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "./hooks/use-cms-strings.js";

/**
 * @typedef {Object} CmsGroupProps
 * @property {string} name        Section name. Joined with parent CmsGroups via dots.
 * @property {React.ReactNode} children
 * @property {React.CSSProperties} [style]   Forwarded to the wrapper div in admin mode.
 * @property {boolean} [editable]
 *   Section-level lock. When `false`, every descendant `<EditableRegion>` /
 *   `<EditableList>` renders read-only (page + drawer card disabled), as if
 *   each carried `editable={false}`. Children may tighten further (a child
 *   `visible={false}` still hides), but cannot loosen past the group.
 * @property {boolean} [visible]
 *   Section-level hide. When `false`, every descendant is removed from the
 *   admin drawer and renders read-only on the page. Takes precedence over
 *   `editable`. Inherited by nested groups (most restrictive wins).
 */

const RING_COLOR_HOVER = `color-mix(in srgb, ${ACCENT} 50%, transparent)`;
const RING_COLOR_OFF   = `color-mix(in srgb, ${ACCENT} 0%, transparent)`;
// The dashed outline sits this far outside the group box; the label straddles it
// and it must clear the children's halos so the group wraps them.
const GROUP_OFFSET     = ROOMY_INSET + 4;

/**
 * @param {CmsGroupProps} props
 */
export function CmsGroup({ name, children, style, editable, visible }) {
  const { isAdmin } = useCmsContext();
  const t = useCmsStrings();
  const parentPrefix = useContext(CmsGroupContext);
  const parentVisibility = useContext(CmsGroupVisibilityContext);
  const [hovered, setHovered] = useState(false);

  const prefix = parentPrefix ? `${parentPrefix}.${name}` : name;

  const ownMode = visible === false ? "hidden" : editable === false ? "readonly" : null;
  const visibility = strongerVisibility(parentVisibility, ownMode);

  if (!isAdmin) {
    return (
      <CmsGroupContext.Provider value={prefix}>
        <CmsGroupVisibilityContext.Provider value={visibility}>
          {children}
        </CmsGroupVisibilityContext.Provider>
      </CmsGroupContext.Provider>
    );
  }

  const modeLabel = visibility === "hidden" ? t("core.group.hidden")
    : visibility === "readonly" ? t("block.readOnly")
    : null;
  const label = modeLabel ? `${prefix} · ${modeLabel}` : prefix;

  return (
    <CmsGroupContext.Provider value={prefix}>
      <CmsGroupVisibilityContext.Provider value={visibility}>
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
              <span style={{ fontWeight: 700, opacity: 0.85 }}>§</span>
              {label}
            </span>
          ) : null}
        </div>
      </CmsGroupVisibilityContext.Provider>
    </CmsGroupContext.Provider>
  );
}
