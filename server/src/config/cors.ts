const DEFAULT_ORIGIN = 'http://localhost:5173';

/** Comma-separated origins in FRONTEND_URL, e.g. `https://https://pixelport.app,http://localhost:5173`. */
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

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(normalizeOrigin(origin));
}

/** Pick a validated frontend origin for OAuth return redirects (query param, cookie, or Referer). */
export function resolveFrontendReturnUrl(
  candidates: {
    queryReturnOrigin?: string;
    cookieReturnOrigin?: string;
    referer?: string;
  },
  allowedOrigins: string[],
  fallback: string,
): string {
  const tryOrigin = (raw: string | undefined): string | null => {
    if (!raw) return null;
    try {
      const origin = new URL(raw).origin;
      return isAllowedOrigin(origin, allowedOrigins) ? origin : null;
    } catch {
      const normalized = normalizeOrigin(raw);
      return isAllowedOrigin(normalized, allowedOrigins) ? normalized : null;
    }
  };

  for (const candidate of [candidates.queryReturnOrigin, candidates.cookieReturnOrigin]) {
    const resolved = tryOrigin(candidate);
    if (resolved) return resolved;
  }

  if (candidates.referer) {
    try {
      const origin = new URL(candidates.referer).origin;
      if (isAllowedOrigin(origin, allowedOrigins)) return origin;
    } catch {
      // ignore malformed Referer
    }
  }

  return normalizeOrigin(fallback);
}

export function corsOriginDelegate(allowedOrigins: string[]) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin ?? allowedOrigins[0]);
      return;
    }
    callback(null, false);
  };
}
