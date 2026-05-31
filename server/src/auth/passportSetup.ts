import type { Express, Request, RequestHandler, Response } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { users } from '../db/schema.js';
import { resolveFrontendReturnUrl } from '../allowedOrigins.js';
import { readCookie } from '../http/cookieHeader.js';
import {
  authPathCookieOptions,
  clearRefreshCookieOptions,
  generateRefreshSecret,
  issueAccessToken,
  persistRefreshToken,
  refreshTtlMs,
} from './tokens.js';
import { collapseUsernameWhitespace } from '../usernameNormalize.js';

export type SerializedUser = { id: string; username: string };

const OAUTH_RETURN_COOKIE = 'oauth_return_origin';
const OAUTH_RETURN_MAX_AGE_MS = 10 * 60 * 1000;

type GithubOAuthProfile = {
  id: string | number;
  displayName?: string;
  username?: string;
  photos?: Array<{ value: string }>;
};

export function setupOAuth(
  app: Express,
  db: AppDatabase,
  jwtSecret: string,
  allowedOrigins: string[],
  fallbackFrontendUrl: string,
) {
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const ghId = process.env.GITHUB_CLIENT_ID;
  const ghSecret = process.env.GITHUB_CLIENT_SECRET;

  function readOAuthReturnOrigin(req: Request): string {
    return resolveFrontendReturnUrl(
      { cookieReturnOrigin: readCookie(req, OAUTH_RETURN_COOKIE) },
      allowedOrigins,
      fallbackFrontendUrl,
    );
  }

  function clearOAuthReturnCookie(res: Response): void {
    res.clearCookie(OAUTH_RETURN_COOKIE, clearRefreshCookieOptions());
  }

  const captureOAuthReturnOrigin: RequestHandler = (req, res, next) => {
    const queryReturn = typeof req.query.returnOrigin === 'string' ? req.query.returnOrigin : undefined;
    const returnBase = resolveFrontendReturnUrl(
      { queryReturnOrigin: queryReturn, referer: req.get('referer') },
      allowedOrigins,
      fallbackFrontendUrl,
    );
    res.cookie(OAUTH_RETURN_COOKIE, returnBase, authPathCookieOptions(OAUTH_RETURN_MAX_AGE_MS));
    next();
  };

  async function upsertUser(
    provider: string,
    providerId: string,
    username: string,
    avatar: string | null,
  ): Promise<SerializedUser> {
    const upsertResult = await db
      .insert(users)
      .values({ provider, providerId, username, avatar })
      .onConflictDoUpdate({
        target: [users.provider, users.providerId],
        set: {
          username: sql`excluded.username`,
          avatar: sql`COALESCE(excluded.avatar, ${users.avatar})`,
        },
      })
      .returning({ id: users.id, username: users.username });
    const row = upsertResult[0];
    if (!row) throw new Error('Failed to persist user');
    return { id: row.id, username: row.username };
  }

  if (googleId && googleSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleId,
          clientSecret: googleSecret,
          callbackURL: `${process.env.SERVER_PUBLIC_URL ?? 'http://localhost:3001'}/auth/google/callback`,
        },
        async (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: VerifyCallback) => {
          try {
            const raw = profile.displayName?.trim() || profile.emails?.[0]?.value || `Google:${profile.id}`;
            const username = collapseUsernameWhitespace(raw, 255) || `Google:${profile.id}`;
            const avatar = profile.photos?.[0]?.value ?? null;
            const user = await upsertUser('google', profile.id, username, avatar);
            done(null, user);
          } catch (error) {
            done(error as Error);
          }
        },
      ),
    );
  }

  if (ghId && ghSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: ghId,
          clientSecret: ghSecret,
          callbackURL: `${process.env.SERVER_PUBLIC_URL ?? 'http://localhost:3001'}/auth/github/callback`,
        },
        async (_accessToken: string, _refreshToken: string, profile: GithubOAuthProfile, done: VerifyCallback) => {
          try {
            const raw = (profile.displayName ?? profile.username ?? 'GitHub user').trim();
            const username = collapseUsernameWhitespace(raw, 255) || 'GitHub user';
            const avatar = profile.photos?.[0]?.value ?? null;
            const user = await upsertUser('github', String(profile.id), username, avatar);
            done(null, user);
          } catch (error) {
            done(error as Error);
          }
        },
      ),
    );
  }

  async function redirectWithOAuthSession(
    res: Response,
    user: SerializedUser,
    returnBase: string,
  ): Promise<void> {
    const raw = generateRefreshSecret();
    await persistRefreshToken(db, user.id, raw, refreshTtlMs());
    const access = issueAccessToken({ id: user.id, username: user.username }, jwtSecret);
    const base = returnBase.replace(/\/$/, '');
    const hash = `access=${encodeURIComponent(access)}&rt=${encodeURIComponent(raw)}`;
    const target = `${base}/auth/callback#${hash}`;
    res.redirect(target);
  }

  function oauthCallback(provider: 'google' | 'github'): RequestHandler {
    return (req, res, next) => {
      passport.authenticate(provider, { session: false }, (err: unknown, user: SerializedUser | false) => {
        const returnBase = readOAuthReturnOrigin(req);
        clearOAuthReturnCookie(res);
        if (err) {
          next(err);
          return;
        }
        if (!user) {
          res.redirect(`${returnBase}/login?error=${provider}`);
          return;
        }
        redirectWithOAuthSession(res, user, returnBase).catch(next);
      })(req, res, next);
    };
  }

  if (googleId && googleSecret) {
    app.get(
      '/auth/google',
      captureOAuthReturnOrigin,
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
      }),
    );

    app.get('/auth/google/callback', oauthCallback('google'));
  }

  if (ghId && ghSecret) {
    app.get(
      '/auth/github',
      captureOAuthReturnOrigin,
      passport.authenticate('github', {
        scope: ['user:email'],
        session: false,
      }),
    );

    app.get('/auth/github/callback', oauthCallback('github'));
  }
}
