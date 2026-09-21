"use client";

/**
 * @file The two stylesheets every admin surface needs, in a chunk of their own.
 *
 * `fieldCss` alone is ~24 KB of rules for editors a visitor never sees, and it
 * used to be a static import of `CmsProvider`, so it shipped in the bundle of
 * every page whether or not anyone could edit it. Reaching it through a dynamic
 * import is what keeps it out: the emission was already gated on `isAdmin`, and
 * now the download is too.
 *
 * `layoutCss` rides along because it is gated the same way and is the other
 * thing an editing session needs before the drawer opens.
 */

import { fieldCss } from "../editors/field-css.js";
import { layoutCss } from "../shared/style/layout-css.js";

export function AdminStyles() {
  return (
    <>
      {/* Above every surface that renders a field: the drawer, the page-side
          inline editors, and a standalone composer on a host page. */}
      <style>{fieldCss}</style>
      <style>{layoutCss}</style>
    </>
  );
}
