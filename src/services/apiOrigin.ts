/** Dev: talk to Express on VITE_PROXY_TARGET / VITE_API_ORIGIN so Set-Cookie and Cookie match (Vite proxy can break cookie attachment). Prod: same-origin relative `/api`. */
export function apiOrigin(): string {
  if (import.meta.env.PROD) {
    return (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
  }
  const raw =
    (import.meta.env.VITE_API_ORIGIN as string | undefined) ??
    (import.meta.env.VITE_PROXY_TARGET as string | undefined) ??
    'http://localhost:3001';
  return raw.replace(/\/$/, '');
}

export function apiUrl(pathAndQuery: string): string {
  const base = apiOrigin();
  const p = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return base === '' ? p : `${base}${p}`;
}
