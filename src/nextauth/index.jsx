"use client";

/**
 * @file NextAuth-aware CmsProvider wrapper.
 *
 * Import from `@skylab/cms/nextauth`.
 * Requires `next-auth` to be installed in the consuming app.
 *
 * Wraps children with NextAuth's `SessionProvider` (so you don't need to
 * add it to layout.jsx) and wires `useSession()` into `CmsProvider` so
 * admin saves include a valid `Authorization: Bearer` header automatically.
 */

import { SessionProvider, useSession } from "next-auth/react";
import { useCallback } from "react";

import { CmsProvider } from "../index.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse } from "../lib/schemas.js"
 */

/**
 * Inner component: needs to be inside `SessionProvider` to call `useSession`.
 *
 * @param {{
 *   config: CmsConfig | { baseUrl: string },
 *   isAdmin: boolean,
 *   userSub: string | null,
 *   initialBlocks?: BlockResponse[],
 *   onAfterSave?: (slug: string) => void | Promise<void>,
 *   children: React.ReactNode,
 * }} props
 */
function Inner({ config, isAdmin, userSub, initialBlocks, onAfterSave, children }) {
  const { data: session } = useSession();

  const getAccessToken = useCallback(
    async () => /** @type {string} */ (session?.accessToken ?? ""),
    [session?.accessToken],
  );

  return (
    <CmsProvider
      config={config}
      isAdmin={isAdmin}
      userSub={userSub}
      initialBlocks={initialBlocks}
      onAfterSave={onAfterSave}
      getAccessToken={isAdmin ? getAccessToken : undefined}
    >
      {children}
    </CmsProvider>
  );
}

/**
 * Drop-in replacement for `CmsProvider` when using NextAuth + Keycloak.
 *
 * The parent Server Component should:
 * 1. Call `getServerSession(authOptions)` to get the session
 * 2. Derive `isAdmin` (e.g. `session !== null`) and `userSub` (`session?.user?.id`)
 * 3. Server-fetch `initialBlocks` with `getCmsContent`
 * 4. Pass `onAfterSave={revalidateCmsSlug}` from `@skylab/cms/actions`
 *
 * @param {{
 *   config: CmsConfig | { baseUrl: string },
 *   isAdmin: boolean,
 *   userSub: string | null,
 *   initialBlocks?: BlockResponse[],
 *   onAfterSave?: (slug: string) => void | Promise<void>,
 *   children: React.ReactNode,
 * }} props
 */
export function NextAuthCmsProvider(props) {
  return (
    <SessionProvider>
      <Inner {...props} />
    </SessionProvider>
  );
}
