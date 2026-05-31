const DEFAULT_API_PORT = '3001';

/** Dev: derive API host from the page URL so LAN phones hit the same machine (e.g. 172.16.0.58:3001). */
function devApiOriginFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  const { hostname, protocol } = window.location;
  if (!hostname) return null;
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
}

/** Dev/prod: talk to Express on VITE_API_ORIGIN (or VITE_PROXY_TARGET in dev). Paths are relative to the API origin (no `/api` prefix). */
export function apiOrigin(): string {
  if (import.meta.env.PROD) {
    return (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
  }
  const explicit =
    (import.meta.env.VITE_API_ORIGIN as string | undefined) ??
    (import.meta.env.VITE_PROXY_TARGET as string | undefined);
  if (explicit) return explicit.replace(/\/$/, '');
  return (devApiOriginFromWindow() ?? 'http://localhost:3001').replace(/\/$/, '');
}

export function apiUrl(pathAndQuery: string): string {
  const base = apiOrigin();
  const relativePath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return base === '' ? relativePath : `${base}${relativePath}`;
}
