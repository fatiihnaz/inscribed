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

import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { ACCENT, BG_RAISED, ROOMY_INSET } from "./admin-drawer-styles.js";
import { useCmsContext } from "../lib/context.js";

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
// and it must clear the children's roomy cards so the group wraps them.
const GROUP_OFFSET     = ROOMY_INSET + 4;

/**
 * @param {CmsGroupProps} props
 */
export function CmsGroup({ name, children, style, editable, visible }) {
  const { isAdmin } = useCmsContext();
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

  const label = visibility ? `${prefix} · ${visibility}` : prefix;

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
                position: "absolute",
                // Straddle the outline's top line at the right, so it sits on the
                // dashed line and clears the child block chips (which sit top-left).
                top: -GROUP_OFFSET,
                right: 8 - GROUP_OFFSET,
                transform: "translateY(-50%)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: BG_RAISED,
                color: "var(--ins-text, #fff)",
                borderRadius: 6,
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.02em",
                lineHeight: 1.5,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                zIndex: 9999,
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
