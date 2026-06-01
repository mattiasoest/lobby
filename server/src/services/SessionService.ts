import jwt from 'jsonwebtoken';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { refreshTokens, users } from '../infrastructure/db/schema.js';
import {
  generateRefreshSecret,
  hashRefreshToken,
  issueAccessToken,
  refreshTtlMs,
} from '../auth/tokens.js';

export class SessionService {
  private readonly jwtSecret: string;

  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
  ) {
    this.jwtSecret = config.jwtSecret;
  }

  async bindSession(accessToken: string, urlRefreshRaw: string): Promise<{ newRaw: string } | null> {
    let sub: string;
    try {
      const payload = jwt.verify(accessToken, this.jwtSecret) as { sub?: string };
      if (typeof payload.sub !== 'string') return null;
      sub = payload.sub;
    } catch {
      return null;
    }

    const ttlMs = refreshTtlMs(this.config);
    return this.db.transaction(async (tx) => {
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

  async rotate(presentedRaw: string): Promise<{ accessToken: string; newRaw: string } | null> {
    const ttlMs = refreshTtlMs(this.config);
    const rotated = await this.db.transaction(async (tx) => {
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

    if (!rotated) return null;
    const accessToken = issueAccessToken(
      { id: rotated.userId, username: rotated.username },
      this.jwtSecret,
      this.config,
    );
    return { accessToken, newRaw: rotated.newRaw };
  }

  async revoke(presentedRaw: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`NOW()` })
      .where(
        and(eq(refreshTokens.tokenHash, hashRefreshToken(presentedRaw)), isNull(refreshTokens.revokedAt)),
      );
  }
}
