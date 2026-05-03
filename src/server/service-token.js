/**
 * @file Keycloak client-credentials token fetcher - server/build-time only.
 *
 * Reads KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER.
 * Returns "" when those vars are absent so callers can skip the header.
 * In-process cache: shared across all requests within one server process,
 * re-fetched 30 s before expiry.
 */

/** @type {{ token: string; expiresAt: number } | null} */
let cache = null;

/**
 * @returns {Promise<string>}
 */
export async function getClientCredentialsToken() {
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const issuer = process.env.KEYCLOAK_ISSUER;

  if (!clientId || !clientSecret || !issuer) return "";

  if (cache && cache.expiresAt > Date.now() + 30_000) return cache.token;

  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `[skylab-cms] Keycloak token request failed: ${res.status} ${await res.text()}`,
    );
  }

  const { access_token, expires_in } = await res.json();
  cache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

export function invalidateClientCredentialsToken() {
  cache = null;
}
