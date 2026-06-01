import type { NextFunction, Request, RequestHandler, Response } from 'express';
import passport from 'passport';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import type { AppConfig } from '../../config/env.js';
import {
  REFRESH_COOKIE_NAME,
  clearOauthStateCookieOptions,
  oauthStateCookieOptions,
  refreshCookieOptions,
} from '../../auth/tokens.js';
import { resolveFrontendReturnUrl, parseAllowedOrigins, primaryFrontendUrl } from '../../config/cors.js';
import { readCookie } from '../../infrastructure/http/cookieHeader.js';
import { collapseUsernameWhitespace } from '../../domain/username.js';
import type { AuthService } from '../../services/AuthService.js';

export type OAuthUser = { id: string; username: string };

export type GithubOAuthProfile = {
  id: string | number;
  displayName?: string;
  username?: string;
  photos?: Array<{ value: string }>;
};

const OAUTH_RETURN_COOKIE = 'oauth_return_origin';
const OAUTH_RETURN_MAX_AGE_MS = 10 * 60 * 1000;

export class AuthController {
  private readonly allowedOrigins: string[];
  private readonly fallbackFrontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfig,
  ) {
    this.allowedOrigins = parseAllowedOrigins(config.frontendUrl);
    this.fallbackFrontendUrl = primaryFrontendUrl(config.frontendUrl);
  }

  getProviders: RequestHandler = (_req, res) => {
    res.json(this.authService.getProviderFlags());
  };

  guestLogin: RequestHandler = async (_req, res) => {
    if (!this.config.allowGuestLogin) {
      res.status(403).json({ error: 'disabled' });
      return;
    }
    try {
      const result = await this.authService.guestLogin();
      res.cookie(REFRESH_COOKIE_NAME, result.refreshRaw, refreshCookieOptions(this.config));
      res.json({ accessToken: result.accessToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed';
      res.status(500).json({ error: message });
    }
  };

  devLogin: RequestHandler = async (req, res) => {
    if (!this.config.allowDevLogin) {
      res.status(403).json({ error: 'disabled' });
      return;
    }
    const usernameRaw = typeof req.body?.username === 'string' ? req.body.username : '';
    try {
      const result = await this.authService.devLogin(usernameRaw);
      if (!result) {
        res.status(400).json({ error: 'username required' });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, result.refreshRaw, refreshCookieOptions(this.config));
      res.json({ accessToken: result.accessToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed';
      res.status(500).json({ error: message });
    }
  };

  captureOAuthReturnOrigin: RequestHandler = (req, res, next) => {
    const queryReturn = typeof req.query.returnOrigin === 'string' ? req.query.returnOrigin : undefined;
    const returnBase = resolveFrontendReturnUrl(
      { queryReturnOrigin: queryReturn, referer: req.get('referer') },
      this.allowedOrigins,
      this.fallbackFrontendUrl,
    );
    res.cookie(OAUTH_RETURN_COOKIE, returnBase, oauthStateCookieOptions(this.config, OAUTH_RETURN_MAX_AGE_MS));
    next();
  };

  oauthCallback(provider: 'google' | 'github'): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate(provider, { session: false }, (err: unknown, user: OAuthUser | false) => {
        const returnBase = this.readOAuthReturnOrigin(req);
        this.clearOAuthReturnCookie(res);
        if (err) {
          next(err);
          return;
        }
        if (!user) {
          res.redirect(`${returnBase}/login?error=${provider}`);
          return;
        }
        this.completeOAuth(user, res, returnBase).catch(next);
      })(req, res, next);
    };
  }

  async verifyGoogleProfile(profile: GoogleProfile): Promise<OAuthUser> {
    const raw = profile.displayName?.trim() || profile.emails?.[0]?.value || `Google:${profile.id}`;
    const username = collapseUsernameWhitespace(raw, 255) || `Google:${profile.id}`;
    const avatar = profile.photos?.[0]?.value ?? null;
    return this.authService.upsertOAuthUser('google', profile.id, username, avatar);
  }

  async verifyGitHubProfile(profile: GithubOAuthProfile): Promise<OAuthUser> {
    const raw = (profile.displayName ?? profile.username ?? 'GitHub user').trim();
    const username = collapseUsernameWhitespace(raw, 255) || 'GitHub user';
    const avatar = profile.photos?.[0]?.value ?? null;
    return this.authService.upsertOAuthUser('github', String(profile.id), username, avatar);
  }

  private readOAuthReturnOrigin(req: Request): string {
    return resolveFrontendReturnUrl(
      { cookieReturnOrigin: readCookie(req, OAUTH_RETURN_COOKIE) },
      this.allowedOrigins,
      this.fallbackFrontendUrl,
    );
  }

  private clearOAuthReturnCookie(res: Response): void {
    res.clearCookie(OAUTH_RETURN_COOKIE, clearOauthStateCookieOptions(this.config));
  }

  private async completeOAuth(user: OAuthUser, res: Response, returnBase: string): Promise<void> {
    const result = await this.authService.issueLoginForUser(user);
    const base = returnBase.replace(/\/$/, '');
    const hash = `access=${encodeURIComponent(result.accessToken)}&rt=${encodeURIComponent(result.refreshRaw)}`;
    res.redirect(`${base}/auth/callback#${hash}`);
  }
}
