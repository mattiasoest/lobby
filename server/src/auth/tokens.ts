import crypto from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { refreshTokens, users } from '../db/schema.js';

export const REFRESH_COOKIE_NAME = 'lobby_rt';

export function accessTokenExpiresIn(): jwt.SignOptions['expiresIn'] {
  const raw = process.env.JWT_ACCESS_EXPIRES ?? '15m';
  return raw as jwt.SignOptions['expiresIn'];
}

export function refreshTtlMs(): number {
  const days = Number(process.env.JWT_REFRESH_DAYS ?? '14');
  if (!Number.isFinite(days) || days < 1) return 14 * 24 * 60 * 60 * 1000;
  return days * 24 * 60 * 60 * 1000;
}

const AUTH_COOKIE_PATH = '/auth';
const SERVER_URL_FALLBACK = 'http://localhost:3001';
const FRONTEND_URL_FALLBACK = 'http://localhost:5173';

function primaryFrontendOrigin(): string {
  const raw = process.env.FRONTEND_URL ?? FRONTEND_URL_FALLBACK;
  return raw.split(',')[0]?.trim() || FRONTEND_URL_FALLBACK;
}

function serverOrigin(): string {
  return process.env.SERVER_PUBLIC_URL ?? SERVER_URL_FALLBACK;
}

/** Use HTTPS-only cookies whenever the API (the host setting the cookie) or the SPA speaks HTTPS. */
function cookieSecure(): boolean {
  if (process.env.REFRESH_COOKIE_SECURE === '1') return true;
  if (process.env.REFRESH_COOKIE_SECURE === '0') return false;
  for (const candidate of [serverOrigin(), primaryFrontendOrigin()]) {
    try {
      if (new URL(candidate).protocol === 'https:') return true;
    } catch {
      // ignore malformed URL, try next
    }
  }
  return false;
}

/** SameSite for the refresh cookie. Defaults to `strict` (pixelport.app + api.pixelport.app topology). */
function refreshCookieSameSite(): NonNullable<CookieOptions['sameSite']> {
  const explicit = process.env.REFRESH_COOKIE_SAMESITE;
  if (explicit === 'none' || explicit === 'lax' || explicit === 'strict') return explicit;
  return 'strict';
}

function cookieBase(sameSite: NonNullable<CookieOptions['sameSite']>): Omit<CookieOptions, 'maxAge'> {
  return {
    httpOnly: true,
    // SameSite=None is only honored by browsers when Secure is also set.
    secure: cookieSecure() || sameSite === 'none',
    sameSite,
    path: AUTH_COOKIE_PATH,
  };
}

export function refreshCookieOptions(): CookieOptions {
  return { ...cookieBase(refreshCookieSameSite()), maxAge: refreshTtlMs() };
}

export function clearRefreshCookieOptions(): CookieOptions {
  return cookieBase(refreshCookieSameSite());
}

/**
 * Transient OAuth state cookie (e.g. the return origin). It must survive the cross-site
 * top-level redirect back from the identity provider, so it is always `Lax` (never `Strict`),
 * which is exactly what a top-level GET callback needs — no `None` required.
 */
export function oauthStateCookieOptions(maxAgeMs: number): CookieOptions {
  return { ...cookieBase('lax'), maxAge: maxAgeMs };
}

export function clearOauthStateCookieOptions(): CookieOptions {
  return cookieBase('lax');
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function generateRefreshSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function issueAccessToken(user: { id: string; username: string }, jwtSecret: string): string {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret, {
    expiresIn: accessTokenExpiresIn(),
  });
}

export async function persistRefreshToken(
  db: AppDatabase,
  userId: string,
  raw: string,
  ttlMs: number = refreshTtlMs(),
): Promise<void> {
  const hash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hash,
    expiresAt,
  });
}

/** Looks up refresh by plaintext, rotates to a new plaintext, returns user + newRaw. */
export async function rotateRefreshToken(
  db: AppDatabase,
  presentedRaw: string,
  ttlMs: number = refreshTtlMs(),
): Promise<{ userId: string; username: string; newRaw: string } | null> {
  return db.transaction(async (tx) => {
    const presentedHash = hashRefreshToken(presentedRaw);
    const sel = await tx
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        username: users.username,
      })
      .from(refreshTokens)
      .innerJoin(users, eq(refreshTokens.userId, users.id))
      .where(
        and(
          eq(refreshTokens.tokenHash, presentedHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, sql`NOW()`),
        ),
      )
      .for('update')
      .limit(1);
    const row = sel[0];
    if (!row) return null;
    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`NOW()` })
      .where(eq(refreshTokens.id, row.id));
    const newRaw = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + ttlMs);
    await tx.insert(refreshTokens).values({
      userId: row.userId,
      tokenHash: hashRefreshToken(newRaw),
      expiresAt,
    });
    return { userId: row.userId, username: row.username, newRaw };
  });
}

/** OAuth + proxied SPA: validates URL-carried refresh matches access JWT; rotates to cookie-bound secret. */
export async function bindRefreshToCookieSession(
  db: AppDatabase,
  jwtSecret: string,
  accessToken: string,
  urlRefreshRaw: string,
  ttlMs: number = refreshTtlMs(),
): Promise<{ newRaw: string } | null> {
  let sub: string;
  try {
    const payload = jwt.verify(accessToken, jwtSecret) as { sub?: string };
    if (typeof payload.sub !== 'string') return null;
    sub = payload.sub;
  } catch {
    return null;
  }

  return db.transaction(async (tx) => {
    const urlRefreshHash = hashRefreshToken(urlRefreshRaw);
    const sel = await tx
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, urlRefreshHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, sql`NOW()`),
        ),
      )
      .for('update')
      .limit(1);
    const row = sel[0];
    if (!row || row.userId !== sub) return null;
    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`NOW()` })
      .where(eq(refreshTokens.id, row.id));
    const newRaw = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + ttlMs);
    await tx.insert(refreshTokens).values({
      userId: row.userId,
      tokenHash: hashRefreshToken(newRaw),
      expiresAt,
    });
    return { newRaw };
  });
}

export async function revokeRefreshByRaw(db: AppDatabase, presentedRaw: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: sql`NOW()` })
    .where(and(eq(refreshTokens.tokenHash, hashRefreshToken(presentedRaw)), isNull(refreshTokens.revokedAt)));
}
