import { Router } from 'express';
import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { isUnlockedAvatarId, sanitizeAvatarId } from '../avatars.js';
import type { AppDatabase } from '../db/client.js';
import { users } from '../db/schema.js';
import type { AuthedRequest } from '../middleware/jwt.js';

export type MeResponse = {
  avatarId: string;
};

export function meRouter(db: AppDatabase, requireAuth: RequestHandler) {
  const router = Router();

  router.get('/me', requireAuth, async (req, res) => {
    const userId = (req as AuthedRequest).user.sub;
    try {
      const rows = await db.select({ avatarId: users.avatarId }).from(users).where(eq(users.id, userId)).limit(1);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const avatarId = sanitizeAvatarId(row.avatarId);
      res.json({ avatarId } satisfies MeResponse);
    } catch (error) {
      console.error('GET /me', error);
      res.status(500).json({ error: 'failed' });
    }
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const userId = (req as AuthedRequest).user.sub;
    const rawAvatarId = req.body?.avatarId;
    if (typeof rawAvatarId !== 'string' || !isUnlockedAvatarId(rawAvatarId)) {
      res.status(400).json({ error: 'invalid_avatar' });
      return;
    }
    try {
      const updated = await db
        .update(users)
        .set({ avatarId: rawAvatarId })
        .where(eq(users.id, userId))
        .returning({ avatarId: users.avatarId });
      const row = updated[0];
      if (!row) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ avatarId: row.avatarId } satisfies MeResponse);
    } catch (error) {
      console.error('PATCH /me', error);
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
}
