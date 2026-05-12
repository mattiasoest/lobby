import { Router } from 'express';
import type { RequestHandler } from 'express';
import { eq, asc } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { messages, users } from '../db/schema.js';
import { maskProfanity } from '../lib/profanity.js';

const ALLOWED_ROOMS = new Set([1, 2, 3, 4]);

export function messagesRouter(db: AppDatabase, requireAuth: RequestHandler) {
  const router = Router();

  router.get('/rooms/:roomId/messages', requireAuth, async (req, res) => {
    const rid = Number(req.params.roomId);
    if (!ALLOWED_ROOMS.has(rid)) {
      res.status(400).json({ error: 'invalid room' });
      return;
    }

    const result = await db
      .select({
        id: messages.id,
        roomId: messages.roomId,
        userId: messages.userId,
        content: messages.content,
        createdAt: messages.createdAt,
        username: users.username,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.roomId, rid))
      .orderBy(asc(messages.createdAt))
      .limit(500);

    res.json(
      result.map((row) => ({
        id: row.id,
        room_id: row.roomId,
        user_id: row.userId,
        content: maskProfanity(row.content),
        username: row.username,
        created_at: row.createdAt.toISOString(),
      })),
    );
  });

  return router;
}
