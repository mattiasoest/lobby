import type { Request } from 'express';

export function flattenCookieHeader(req: Request): string | undefined {
  const v = req.headers.cookie;
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v.filter(Boolean).join('; ');
  return v.length ? v : undefined;
}

/** Prefer `cookie-parser`; fall back to raw header when the parser misses (e.g. proxy edge cases). */
export function readCookie(req: Request, name: string): string | undefined {
  const parsed = req.cookies?.[name];
  if (typeof parsed === 'string' && parsed !== '') return parsed;

  const raw = flattenCookieHeader(req);
  if (!raw) return undefined;

  for (const piece of raw.split(';')) {
    const segment = piece.trim();
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    const key = segment.slice(0, eq).trim();
    if (key !== name) continue;
    const encoded = segment.slice(eq + 1).trim();
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return undefined;
}
