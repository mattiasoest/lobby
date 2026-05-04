import { Router } from 'express';
import type pg from 'pg';
import type { RequestHandler } from 'express';

const ALLOWED_ROOMS = new Set([1, 2, 3, 4]);

export function messagesRouter(pool: pg.Pool, requireAuth: RequestHandler) {
  const r = Router();

  r.get('/rooms/:roomId/messages', requireAuth, async (req, res) => {
    const rid = Number(req.params.roomId);
    if (!ALLOWED_ROOMS.has(rid)) {
      res.status(400).json({ error: 'invalid room' });
      return;
    }

    const result = await pool.query<{
      id: string
      room_id: number
      user_id: string
      content: string
      created_at: Date
      username: string
    }>(
      `
      SELECT m.id, m.room_id, m.user_id, m.content, m.created_at, u.username
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 500
      `,
      [rid]
    );

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        room_id: row.room_id,
        user_id: row.user_id,
        content: row.content,
        username: row.username,
        created_at: row.created_at.toISOString(),
      }))
    );
  });

  return r;
}
