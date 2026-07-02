/**
 * @file `withCms(slug, Component)`: discovery root marker. The manifest
 * scanner (`cms-sync`) reads these call sites to learn which slug owns the
 * `<EditableRegion>` declarations reachable from that file; without a root the
 * page's regions never enter the manifest. At runtime it's a passthrough:
 * `<CmsPage>` already mounts the provider (typically once in the root layout),
 * so wrapping here again would mount it twice.
 */

/**
 * Mark a page component as the discovery root for `slug`. Runtime no-op.
 *
 * The slug must be a string literal; the scanner resolves it statically and
 * skips non-literal calls with a warning.
 *
 * @template T
 * @param {string} slug  Page slug the discovered regions belong to, e.g. "/team".
 * @param {T} Component
 * @returns {T}
 */
export function withCms(slug, Component) {
  return Component;
}
