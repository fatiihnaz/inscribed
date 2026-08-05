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

export { CmsProvider } from "./core/CmsProvider.jsx";
export { EditableRegion } from "./core/EditableRegion.jsx";
export { EditableList } from "./core/EditableList.jsx";
export { CmsGroup } from "./core/CmsGroup.jsx";

export { useCmsContent } from "./core/hooks/use-cms-content.js";
export { useCmsAdmin } from "./core/hooks/use-cms-admin.js";
export { useCmsBlock } from "./core/hooks/use-cms-block.js";
export { useCmsRoute } from "./core/hooks/use-cms-route.js";
export { useCountdown } from "./core/hooks/use-countdown.js";

export { createCmsConfig } from "./shared/config.js";
export { CmsApiError } from "./shared/contracts/errors.js";
export { getBlock, getBlockValue, groupBlocksByPrefix, indexBlocksByPath } from "./core/blocks.js";

/**
 * Public type re-exports. These shapes surface through the public API (e.g.
 * `CmsProvider`'s props), so consumers and plugins reference them by name
 * (`@import { CmsConfig } from "inscribed"`). Changing them is breaking.
 *
 * @typedef {import("./shared/config.js").CmsConfig} CmsConfig
 * @typedef {import("./shared/style/theme.js").CmsTheme} CmsTheme
 * @typedef {import("./shared/contracts/schemas.js").BlockResponse} BlockResponse
 */