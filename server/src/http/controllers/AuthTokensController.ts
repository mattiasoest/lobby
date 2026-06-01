import express, { type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from '../../auth/tokens.js';
import { readCookie } from '../../infrastructure/http/cookieHeader.js';
import type { SessionService } from '../../services/SessionService.js';

/** JSON body parser for session bind route only. */
export const sessionJsonParser = express.json();

export class AuthTokensController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly config: AppConfig,
  ) {}

  bindSession: RequestHandler = async (req, res): Promise<void> => {
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
      const bound = await this.sessionService.bindSession(access, bodyRt);
      if (!bound) {
        res.status(401).json({ error: 'invalid_session' });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, bound.newRaw, refreshCookieOptions(this.config));
      res.status(204).end();
    } catch {
      res.status(500).json({ error: 'session_failed' });
    }
  };

  refresh: RequestHandler = async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (!raw) {
      res.status(401).json({ error: 'no_refresh' });
      return;
    }
    try {
      const rotated = await this.sessionService.rotate(raw);
      if (!rotated) {
        res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions(this.config));
        res.status(401).json({ error: 'invalid_refresh' });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, rotated.newRaw, refreshCookieOptions(this.config));
      res.json({ accessToken: rotated.accessToken });
    } catch {
      res.status(500).json({ error: 'refresh_failed' });
    }
  };

  logout: RequestHandler = async (req, res): Promise<void> => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (raw) await this.sessionService.revoke(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions(this.config));
    res.status(204).end();
  };
}
