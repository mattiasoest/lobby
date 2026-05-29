import { apiUrl } from './apiOrigin.ts';

export type CredentialRefreshOutcome = {
  ok: boolean;
  accessToken: string | null;
};

let credentialRefreshPromise: Promise<CredentialRefreshOutcome> | null = null;

/**
 * Single-flight POST /api/auth/refresh. React Strict Mode mounts effects twice — without this,
 * two requests race: the first rotates the refresh cookie hash, the second still sends the old
 * cookie and gets 401, and the survivor effect may skip applying the access token (`cancelled`).
 */
export async function refreshAccessFromCookieSingleFlight(): Promise<CredentialRefreshOutcome> {
  if (!credentialRefreshPromise) {
    credentialRefreshPromise = (async (): Promise<CredentialRefreshOutcome> => {
      const res = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return { ok: false, accessToken: null };
      const data = (await res.json()) as { accessToken?: string };
      const accessToken = data.accessToken ?? null;
      if (!accessToken) return { ok: false, accessToken: null };
      return { ok: true, accessToken };
    })().finally(() => {
      credentialRefreshPromise = null;
    });
  }
  return credentialRefreshPromise;
}
