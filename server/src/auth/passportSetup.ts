import type { Express } from 'express';
import type pg from 'pg';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
  type VerifyCallback,
} from 'passport-google-oauth20';

export type SerializedUser = { id: string; username: string }

type GithubOAuthProfile = {
  id: string | number
  displayName?: string
  username?: string
  photos?: Array<{ value: string }>
}

export function setupOAuth(
  app: Express,
  pool: pg.Pool,
  jwtSecret: string,
  frontendUrl: string
) {
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const ghId = process.env.GITHUB_CLIENT_ID;
  const ghSecret = process.env.GITHUB_CLIENT_SECRET;

  async function upsertUser(
    provider: string,
    providerId: string,
    username: string,
    avatar: string | null
  ): Promise<SerializedUser> {
    const r = await pool.query<{
      id: string
      username: string
    }>(
      `
      INSERT INTO users (provider, provider_id, username, avatar)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (provider, provider_id) DO UPDATE SET
        username = EXCLUDED.username,
        avatar = COALESCE(EXCLUDED.avatar, users.avatar)
      RETURNING id, username
      `,
      [provider, providerId, username, avatar]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to persist user');
    return { id: row.id, username: row.username };
  }

  if (googleId && googleSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleId,
          clientSecret: googleSecret,
          callbackURL: `${process.env.SERVER_PUBLIC_URL ?? 'http://localhost:3001'}/api/auth/google/callback`,
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: VerifyCallback
        ) => {
          try {
            const username =
              profile.displayName?.trim() ||
              profile.emails?.[0]?.value ||
              `Google:${profile.id}`;
            const avatar = profile.photos?.[0]?.value ?? null;
            const user = await upsertUser(
              'google',
              profile.id,
              username,
              avatar
            );
            done(null, user);
          } catch (e) {
            done(e as Error);
          }
        }
      )
    );
  }

  if (ghId && ghSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: ghId,
          clientSecret: ghSecret,
          callbackURL: `${process.env.SERVER_PUBLIC_URL ?? 'http://localhost:3001'}/api/auth/github/callback`,
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GithubOAuthProfile,
          done: VerifyCallback
        ) => {
          try {
            const username = profile.displayName ?? profile.username ?? 'GitHub user';
            const avatar = profile.photos?.[0]?.value ?? null;
            const user = await upsertUser('github', String(profile.id), username, avatar);
            done(null, user);
          } catch (e) {
            done(e as Error);
          }
        }
      )
    );
  }

  function redirectWithToken(res: import('express').Response, user: SerializedUser) {
    const token = jwt.sign({ sub: user.id, username: user.username }, jwtSecret, {
      expiresIn: '7d',
    });
    const target = `${frontendUrl.replace(/\/$/, '')}/auth/callback#token=${encodeURIComponent(token)}`;
    res.redirect(target);
  }

  if (googleId && googleSecret) {
    app.get(
      '/api/auth/google',
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
      })
    );

    app.get(
      '/api/auth/google/callback',
      passport.authenticate('google', {
        failureRedirect: `${frontendUrl}/login?error=google`,
        session: false,
      }),
      (req, res) => {
        redirectWithToken(res, req.user as SerializedUser);
      }
    );
  }

  if (ghId && ghSecret) {
    app.get(
      '/api/auth/github',
      passport.authenticate('github', { scope: ['user:email'], session: false })
    );

    app.get(
      '/api/auth/github/callback',
      passport.authenticate('github', {
        failureRedirect: `${frontendUrl}/login?error=github`,
        session: false,
      }),
      (req, res) => {
        redirectWithToken(res, req.user as SerializedUser);
      }
    );
  }
}
