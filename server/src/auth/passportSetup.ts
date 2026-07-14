import type { Express } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy, type VerifyCallback } from 'passport-google-oauth20';
import type { AppConfig } from '../config/env.js';
import type { AuthController, GithubOAuthProfile } from '../http/controllers/AuthController.js';

/** Registers Passport strategies and mounts OAuth routes — handlers live on AuthController. */
export function setupOAuth(app: Express, config: AppConfig, auth: AuthController): void {
  const googleId = config.googleClientId;
  const googleSecret = config.googleClientSecret;
  const ghId = config.githubClientId;
  const ghSecret = config.githubClientSecret;

  if (googleId && googleSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleId,
          clientSecret: googleSecret,
          callbackURL: `${config.serverPublicUrl}/auth/google/callback`,
        },
        (_accessToken, _refreshToken, profile, done: VerifyCallback) => {
          void auth
            .verifyGoogleProfile(profile)
            .then((user) => done(null, user))
            .catch((error) => done(error as Error));
        },
      ),
    );

    app.get(
      '/auth/google',
      auth.captureOAuthReturnOrigin,
      passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
    );
    app.get('/auth/google/callback', auth.oauthCallback('google'));
  }

  if (ghId && ghSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: ghId,
          clientSecret: ghSecret,
          callbackURL: `${config.serverPublicUrl}/auth/github/callback`,
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: GithubOAuthProfile,
          done: VerifyCallback,
        ) => {
          void auth
            .verifyGitHubProfile(profile)
            .then((user) => done(null, user))
            .catch((error) => done(error as Error));
        },
      ),
    );

    app.get(
      '/auth/github',
      auth.captureOAuthReturnOrigin,
      passport.authenticate('github', { scope: ['user:email'], session: false }),
    );
    app.get('/auth/github/callback', auth.oauthCallback('github'));
  }
}
