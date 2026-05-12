import { sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    avatar: text('avatar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('users_provider_provider_id_unique').on(t.provider, t.providerId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: smallint('room_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    contentRaw: text('content_raw').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('messages_room_id_check', sql`${t.roomId} BETWEEN 1 AND 4`),
    index('idx_messages_room_created').on(t.roomId, t.createdAt.asc()),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_refresh_tokens_lookup')
      .on(t.tokenHash)
      .where(sql`${t.revokedAt} IS NULL`),
    index('idx_refresh_tokens_user').on(t.userId),
  ],
);
