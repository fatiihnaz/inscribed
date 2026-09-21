/**
 * @file Letting a page-side component's editing chrome arrive.
 *
 * `<EditableRegion>` and the other page-side primitives reach their admin half
 * through a dynamic import, so the ring, the chip and the in-place editors land
 * a beat after the published content rather than with it. That is the point (a
 * visitor downloads none of it), and it means a test asserting on any of them
 * has to wait for that beat.
 *
 * Waiting on the module rather than on the DOM, because the DOM cannot tell the
 * two states apart: the fallback is the published render, and for several block
 * types that is itself a `<span>`, which is also what the admin wrapper is.
 * Importing the module resolves the same promise React is suspended on, and the
 * flush is the retry.
 *
 * Not a `*.test.js` file, so the runner never collects it.
 */

import { act } from "@testing-library/react";

/**
 * Resolve once every page-side admin chunk is loaded and React has re-rendered
 * the boundaries that were waiting on them.
 *
 * @returns {Promise<void>}
 */
export async function settleAdminChrome() {
  await Promise.all([
    import("../core/EditableRegionAdmin.jsx"),
    import("../core/EditableListAdmin.jsx"),
    import("../core/CmsGroupAdmin.jsx"),
    import("../collections/CollectionEditScope.jsx"),
    import("../collections/CollectionFieldAdmin.jsx"),
  ]);
  await act(async () => {});
}
