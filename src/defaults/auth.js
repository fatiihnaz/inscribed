/**
 * @file Default auth adapter: anonymous/public. No session resolver, so every
 * visitor is a non-admin public user, which is why the CMS renders with zero
 * auth dependency. Pass your own adapter to `createCmsPage` to enable editing.
 *
 * `deriveAdmin` / `deriveUserSub` are the fallbacks when a consumer overrides
 * only `getSession`: any session counts as admin, its `user.id` as the subject.
 */

/**
 * @type {import("../lib/auth.js").CmsAuthAdapter}
 */
export const publicAuth = {
  getSession: async () => null,
  deriveAdmin: (session) => session != null,
  deriveUserSub: (session) => session?.user?.id ?? null,
};
