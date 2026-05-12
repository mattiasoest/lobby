import express, { Router } from 'express';
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
import type { AppDatabase } from '../db/client.js';

export function createAuthTokensRouter(db: AppDatabase, jwtSecret: string) {
  const router = Router();

  router.post('/session', express.json(), async (req, res): Promise<void> => {
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
      const bound = await bindRefreshToCookieSession(db, jwtSecret, access, bodyRt);
      if (!bound) {
        res.status(401).json({ error: 'invalid_session' });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, bound.newRaw, refreshCookieOptions());
      res.status(204).end();
    } catch (error) {
      console.error('auth session', error);
      res.status(500).json({ error: 'session_failed' });
    }
  });

  router.post('/refresh', async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (!raw) {
      res.status(401).json({ error: 'no_refresh' });
      return;
    }
    try {
      const rotated = await rotateRefreshToken(db, raw);
      if (!rotated) {
        res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
        res.status(401).json({ error: 'invalid_refresh' });
        return;
      }
      const accessToken = issueAccessToken({ id: rotated.userId, username: rotated.username }, jwtSecret);
      res.cookie(REFRESH_COOKIE_NAME, rotated.newRaw, refreshCookieOptions());
      res.json({ accessToken });
    } catch (error) {
      console.error('auth refresh', error);
      res.status(500).json({ error: 'refresh_failed' });
    }
  });

  router.post('/logout', async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (raw) await revokeRefreshByRaw(db, raw);
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
    res.status(204).end();
  });

  return router;
}
