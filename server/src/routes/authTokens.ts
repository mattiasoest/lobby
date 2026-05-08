import express, { Router } from 'express';
import type pg from 'pg';
import { readCookie } from '../http/cookieHeader.js';
import {
  REFRESH_COOKIE_NAME,
  bindRefreshToCookieSession,
  clearRefreshCookieOptions,
  issueAccessToken,
  refreshCookieOptions,
  revokeRefreshByRaw,
  rotateRefreshToken,
} from '../auth/tokens.js';

export function createAuthTokensRouter(pool: pg.Pool, jwtSecret: string) {
  const r = Router();

  r.post('/session', express.json(), async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const access = auth.slice(7);
    const bodyRt = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!bodyRt) {
      res.status(400).json({ error: 'refresh_token_required' });
      return;
    }
    try {
      const bound = await bindRefreshToCookieSession(pool, jwtSecret, access, bodyRt);
      if (!bound) {
        res.status(401).json({ error: 'invalid_session' });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, bound.newRaw, refreshCookieOptions());
      res.status(204).end();
    } catch (e) {
      console.error('auth session', e);
      res.status(500).json({ error: 'session_failed' });
    }
  });

  r.post('/refresh', async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (!raw) {
      res.status(401).json({ error: 'no_refresh' });
      return;
    }
    try {
      const rotated = await rotateRefreshToken(pool, raw);
      if (!rotated) {
        res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
        res.status(401).json({ error: 'invalid_refresh' });
        return;
      }
      const accessToken = issueAccessToken({ id: rotated.userId, username: rotated.username }, jwtSecret);
      res.cookie(REFRESH_COOKIE_NAME, rotated.newRaw, refreshCookieOptions());
      res.json({ accessToken });
    } catch (e) {
      console.error('auth refresh', e);
      res.status(500).json({ error: 'refresh_failed' });
    }
  });

  r.post('/logout', async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (raw) await revokeRefreshByRaw(pool, raw);
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
    res.status(204).end();
  });

  return r;
}
