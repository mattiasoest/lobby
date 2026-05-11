import crypto from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import type pg from 'pg';

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
  pool: pg.Pool,
  userId: string,
  raw: string,
  ttlMs: number = refreshTtlMs(),
): Promise<void> {
  const hash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3::timestamptz)`,
    [userId, hash, expiresAt.toISOString()],
  );
}

/** Looks up refresh by plaintext, rotates to a new plaintext, returns user + newRaw. */
export async function rotateRefreshToken(
  pool: pg.Pool,
  presentedRaw: string,
  ttlMs: number = refreshTtlMs(),
): Promise<{ userId: string; username: string; newRaw: string } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const presentedHash = hashRefreshToken(presentedRaw);
    const sel = await client.query<{
      id: string;
      user_id: string;
      username: string;
    }>(
      `
      SELECT rt.id, rt.user_id, u.username
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1
        AND rt.revoked_at IS NULL
        AND rt.expires_at > NOW()
      FOR UPDATE`,
      [presentedHash],
    );
    const row = sel.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    const newRaw = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + ttlMs);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3::timestamptz)`,
      [row.user_id, hashRefreshToken(newRaw), expiresAt.toISOString()],
    );
    await client.query('COMMIT');
    return { userId: row.user_id, username: row.username, newRaw };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** OAuth + proxied SPA: validates URL-carried refresh matches access JWT; rotates to cookie-bound secret. */
export async function bindRefreshToCookieSession(
  pool: pg.Pool,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const urlRefreshHash = hashRefreshToken(urlRefreshRaw);
    const sel = await client.query<{ id: string; user_id: string }>(
      `
      SELECT id, user_id
      FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      FOR UPDATE`,
      [urlRefreshHash],
    );
    const row = sel.rows[0];
    if (!row || row.user_id !== sub) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    const newRaw = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + ttlMs);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3::timestamptz)`,
      [row.user_id, hashRefreshToken(newRaw), expiresAt.toISOString()],
    );
    await client.query('COMMIT');
    return { newRaw };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeRefreshByRaw(pool: pg.Pool, presentedRaw: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashRefreshToken(presentedRaw)],
  );
}
