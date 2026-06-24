"use client";

/**
 * @file Public client-side API for `inscribed`. Server-only helpers live at
 * `inscribed/server`; everything re-exported here ships in the client bundle.
 *
 * The top-level `"use client"` is load-bearing. tsup bundles every transitive
 * `.jsx` into `dist/index.js` and drops inner-file directives, keeping only
 * the entry file's. So it must stay here for Next.js to treat the bundle as a
 * Client Component.
 */

export { CmsProvider } from "./components/CmsProvider.jsx";
export { EditableRegion } from "./components/EditableRegion.jsx";
export { EditableList } from "./components/EditableList.jsx";
export { CmsGroup } from "./components/CmsGroup.jsx";

export { useCmsContent } from "./hooks/use-cms-content.js";
export { useCmsAdmin } from "./hooks/use-cms-admin.js";
export { useCmsBlock } from "./hooks/use-cms-block.js";
export { useCountdown } from "./hooks/use-countdown.js";

export { createCmsConfig } from "./lib/config.js";
export { CmsApiError } from "./lib/errors.js";
export { getBlock, getBlockValue, groupBlocksByPrefix, indexBlocksByPath } from "./lib/blocks.js";

/**
 * Public type re-exports. These shapes surface through the public API (e.g.
 * `CmsProvider`'s props), so consumers and plugins reference them by name
 * (`@import { CmsConfig } from "inscribed"`). Changing them is breaking.
 *
 * @typedef {import("./lib/config.js").CmsConfig} CmsConfig
 * @typedef {import("./lib/theme.js").CmsTheme} CmsTheme
 * @typedef {import("./lib/schemas.js").BlockResponse} BlockResponse
 */