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

/** Use HTTPS-only cookies when the browser actually talks HTTPS to the SPA. */
function refreshCookieSecure(): boolean {
  if (process.env.REFRESH_COOKIE_SECURE === '1') return true;
  if (process.env.REFRESH_COOKIE_SECURE === '0') return false;
  try {
    const frontendBaseUrl = new URL(process.env.FRONTEND_URL ?? 'http://localhost:5173');
    return frontendBaseUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function refreshCookieBase(): Omit<CookieOptions, 'maxAge'> {
  return {
    httpOnly: true,
    secure: refreshCookieSecure(),
    sameSite: 'lax',
    path: '/api/auth',
  };
}

export function refreshCookieOptions(): CookieOptions {
  return { ...refreshCookieBase(), maxAge: refreshTtlMs() };
}

export function clearRefreshCookieOptions(): CookieOptions {
  return refreshCookieBase();
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
