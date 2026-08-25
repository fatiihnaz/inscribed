"use client";

/**
 * @file Public API for custom admin panels, exposed as the `inscribed/panels`
 * subpath. A panel is registered as data (`createCmsPage({ panels })`) and
 * rendered by the drawer; this is what its own component imports to reach the
 * CMS from inside.
 *
 * Its own subpath rather than the main entry: nothing here is of use to a page,
 * and the main bundle is what every visitor downloads.
 *
 * The top-level `"use client"` is load-bearing, same as in `index.js` and
 * `collections.js`: tsup keeps only the entry file's directive.
 */

export { useCmsPanel } from "./panels/context.js";
// The drill-down a panel with more than one view wants. Optional: a panel is
// free to draw its own transitions and report the header path itself through
// `useCmsPanel().setCrumbs`, which is all this does underneath.
export { PanelStack } from "./panels/PanelStack.jsx";

/**
 * @typedef {import("./shared/panels.js").CmsPanel} CmsPanel
 * @typedef {import("./panels/context.js").CmsPanelApi} CmsPanelApi
 * @typedef {import("./panels/PanelStack.jsx").PanelStackView} PanelStackView
 */
