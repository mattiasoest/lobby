import { apiUrl } from '../../services/apiOrigin.ts';

export type OAuthFragment = { access: string; rt: string | null };

/**
 * Holds the OAuth hash across React 18 Strict Mode's immediate unmount/remount (same navigation only).
 * In-memory — not written to sessionStorage/localStorage so a one-off `rt` isn't persisted via web APIs.
 * (The `rt` still appears in `location.hash` briefly before we strip it — that's unavoidable for SPA+fragment OAuth.)
 */
let oauthFragmentHold: OAuthFragment | null = null;

/**
 * Reads `#access=` / `#token=` (+ optional `rt=`), survives Strict Mode by reusing oauthFragmentHold
 * after the URL hash is stripped on first consumption.
 */
export function consumeOAuthFragmentFromUrl(): OAuthFragment | null {
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;

  if (rawHash) {
    const params = new URLSearchParams(rawHash);
    const access = params.get('access') ?? params.get('token');
    const rt = params.get('rt');
    if (access) {
      oauthFragmentHold = { access, rt };
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  if (!oauthFragmentHold) return null;
  const { access, rt } = oauthFragmentHold;
  if (!access) return null;
  return { access, rt };
}

export function clearOAuthFragmentStaging(): void {
  oauthFragmentHold = null;
}

const sessionByAccess = new Map<string, Promise<boolean>>();

/**
 * Strict Mode mounts twice; reuse one POST /session so the one-time refresh token isn't consumed twice.
 */
export function bootstrapServerSession(access: string, rt: string | null): Promise<boolean> {
  if (!rt) return Promise.resolve(true);

  let pending = sessionByAccess.get(access);
  if (!pending) {
    pending = (async (): Promise<boolean> => {
      const sessionRes = await fetch(apiUrl('/api/auth/session'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: rt }),
      });
      return sessionRes.status !== 401 && sessionRes.status !== 400;
    })();
    sessionByAccess.set(access, pending);
  }
  return pending;
}

export function clearSessionBootstrapCache(access: string): void {
  sessionByAccess.delete(access);
}
