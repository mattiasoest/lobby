import { apiUrl } from './apiOrigin.ts';

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

let refreshAccessTokenHook: (() => Promise<string | null>) | null = null;

let refreshInFlight: Promise<string | null> | null = null;

/** Wire token refresh (e.g. from AuthProvider). Pass null to clear. */
export function configureAuthApi(refresh: (() => Promise<string | null>) | null): void {
  refreshAccessTokenHook = refresh;
}

async function singleFlightRefresh(): Promise<string | null> {
  if (!refreshAccessTokenHook) return null;
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessTokenHook().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const run = async (t: string) => {
    const headers = new Headers(init?.headers ?? undefined);
    headers.set('Authorization', `Bearer ${t}`);
    return fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
  };

  let res = await run(token);
  if (res.status === 401) {
    const next = await singleFlightRefresh();
    if (next) res = await run(next);
  }

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }

  return parseJsonSafe<T>(res);
}
