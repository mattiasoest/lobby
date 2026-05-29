const DEFAULT_ORIGIN = 'http://localhost:5173';

/** Comma-separated origins in FRONTEND_URL, e.g. `https://lobby-rho.vercel.app,http://localhost:5173`. */
export function parseAllowedOrigins(raw?: string): string[] {
  const source = (raw ?? DEFAULT_ORIGIN).trim() || DEFAULT_ORIGIN;
  const origins = source
    .split(',')
    .map((part) => part.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

export function primaryFrontendUrl(raw?: string): string {
  return parseAllowedOrigins(raw)[0] ?? DEFAULT_ORIGIN;
}

export function corsOriginDelegate(allowedOrigins: string[]) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
  ) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin ?? allowedOrigins[0]);
      return;
    }
    callback(null, false);
  };
}
