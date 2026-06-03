import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import { collapseUsernameWhitespace } from '../domain/username.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { refreshTokens, users } from '../infrastructure/db/schema.js';
import { generateRefreshSecret, hashRefreshToken, issueAccessToken, refreshTtlMs } from '../auth/tokens.js';

export type AuthLoginResult = {
  accessToken: string;
  refreshRaw: string;
  user: { id: string; username: string };
};

export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
  ) {
    this.jwtSecret = config.jwtSecret;
  }

  getProviderFlags() {
    return {
      google: !!(this.config.googleClientId && this.config.googleClientSecret),
      github: !!(this.config.githubClientId && this.config.githubClientSecret),
      dev: this.config.allowDevLogin,
      guest: this.config.allowGuestLogin,
    };
  }

  async guestLogin(): Promise<AuthLoginResult> {
    const guestId = crypto.randomUUID();
    const suffix = crypto.randomBytes(3).toString('hex');
    const username = `Guest-${suffix}`;
    const insertResult = await this.db
      .insert(users)
      .values({
        provider: 'guest',
        providerId: `guest:${guestId}`,
        username,
        avatar: null,
      })
      .returning({ id: users.id, username: users.username });
    const user = insertResult[0];
    if (!user) throw new Error('Failed to create guest user');

    return this.issueLoginForUser(user);
  }

  async devLogin(usernameRaw: string): Promise<AuthLoginResult | null> {
    const username = collapseUsernameWhitespace(usernameRaw, 64);
    if (!username) return null;

    const insertResult = await this.db
      .insert(users)
      .values({
        provider: 'dev',
        providerId: `dev:${username}`,
        username,
        avatar: null,
      })
      .onConflictDoUpdate({
        target: [users.provider, users.providerId],
        set: { username: sql`excluded.username` },
      })
      .returning({ id: users.id, username: users.username });
    const user = insertResult[0];
    if (!user) throw new Error('Failed to upsert dev user');

    return this.issueLoginForUser(user);
  }

  async upsertOAuthUser(
    provider: string,
    providerId: string,
    username: string,
    avatar: string | null,
  ): Promise<{ id: string; username: string }> {
    const upsertResult = await this.db
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
    return row;
  }

  async issueLoginForUser(user: { id: string; username: string }): Promise<AuthLoginResult> {
    const raw = generateRefreshSecret();
    const ttl = refreshTtlMs(this.config);
    await this.persistRefreshToken(user.id, raw, new Date(Date.now() + ttl));
    const accessToken = issueAccessToken({ id: user.id, username: user.username }, this.jwtSecret, this.config);
    return { accessToken, refreshRaw: raw, user };
  }

  private async persistRefreshToken(userId: string, raw: string, expiresAt: Date): Promise<void> {
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
    });
  }
}
