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
 *
 * Only the first of those is here. The ring and the label need the chip styles,
 * the icon set and the panel's wording, so they live in `CmsGroupAdmin` behind
 * a dynamic import; the contexts are what every descendant actually depends on,
 * and they are published either way.
 */

import { lazy, Suspense, useContext } from "react";

import { CmsGroupContext, CmsGroupVisibilityContext, ownVisibility, strongerVisibility } from "../shared/state/group-context.js";
import { useCmsContext } from "../shared/state/cms-context.js";

const CmsGroupAdmin = lazy(() =>
  import("./CmsGroupAdmin.jsx").then((m) => ({ default: m.CmsGroupAdmin })),
);

/**
 * @typedef {Object} CmsGroupProps
 * @property {string} name        Section name. Joined with parent CmsGroups via dots.
 * @property {React.ReactNode} children
 * @property {React.CSSProperties} [style]   Forwarded to the wrapper div in admin mode.
 * @property {boolean} [readOnly]
 *   Section-level lock. Every descendant `<EditableRegion>` / `<EditableList>`
 *   renders read-only (page + drawer card disabled), as if each carried
 *   `readOnly`. Children may tighten further (a child `hidden` still hides),
 *   but cannot loosen past the group.
 * @property {boolean} [hidden]
 *   Section-level hide. Every descendant is removed from the admin drawer and
 *   renders read-only on the page. Takes precedence over `readOnly`. Inherited
 *   by nested groups (most restrictive wins).
 * @property {boolean} [editable]
 *   Deprecated, use `readOnly`. Older, inverted spelling: `editable={false}`
 *   locks the section. Still honoured.
 * @property {boolean} [visible]
 *   Deprecated, use `hidden`. Older, inverted spelling: `visible={false}` hides
 *   the section. Still honoured.
 */

/**
 * @param {CmsGroupProps} props
 */
export function CmsGroup({ name, children, style, hidden, readOnly, editable, visible }) {
  const { isAdmin } = useCmsContext();
  const parentPrefix = useContext(CmsGroupContext);
  const parentVisibility = useContext(CmsGroupVisibilityContext);

  const prefix = parentPrefix ? `${parentPrefix}.${name}` : name;
  const visibility = strongerVisibility(parentVisibility, ownVisibility({ hidden, readOnly, visible, editable }));

  return (
    <CmsGroupContext.Provider value={prefix}>
      <CmsGroupVisibilityContext.Provider value={visibility}>
        {isAdmin ? (
          <Suspense fallback={children}>
            <CmsGroupAdmin prefix={prefix} visibility={visibility} style={style}>
              {children}
            </CmsGroupAdmin>
          </Suspense>
        ) : children}
      </CmsGroupVisibilityContext.Provider>
    </CmsGroupContext.Provider>
  );
}
