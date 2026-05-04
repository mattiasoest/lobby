import type { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import type pg from 'pg';

export const ROOM_IDS = [1, 2, 3, 4] as const;

export type PlayerPublic = {
  id: string
  username: string
  x: number
  y: number
  userId: string
}

export function registerRoomNamespaces(
  io: Server,
  opts: { jwtSecret: string; pool: pg.Pool }
) {
  const { jwtSecret, pool } = opts;

  for (const roomId of ROOM_IDS) {
    const nsp = io.of(`/room-${roomId}`);

    nsp.use((socket, next) => {
      const authToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
      const header =
        typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined;
      const raw = authToken ?? header;
      if (!raw) {
        next(new Error('unauthorized'));
        return;
      }
      try {
        const payload = jwt.verify(raw, jwtSecret) as { sub: string; username: string };
        socket.data.user = payload;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    const players = new Map<string, PlayerPublic>();

    const broadcastPlayers = () => {
      nsp.emit('players:update', [...players.values()]);
    };

    nsp.on('connection', (socket) => {
      socket.on('player:join', (payload: { x: number; y: number }) => {
        const u = socket.data.user as { sub: string; username: string };
        players.set(socket.id, {
          id: socket.id,
          username: u.username,
          x: payload.x,
          y: payload.y,
          userId: u.sub,
        });
        broadcastPlayers();
      });

      socket.on('player:move', (payload: { x: number; y: number }) => {
        const row = players.get(socket.id);
        if (!row) return;
        row.x = payload.x;
        row.y = payload.y;
        broadcastPlayers();
      });

      socket.on('player:leave', () => {
        players.delete(socket.id);
        broadcastPlayers();
      });

      socket.on('chat:send', async (payload: { content: string }) => {
        const u = socket.data.user as { sub: string; username: string };
        const content =
          typeof payload?.content === 'string' ? payload.content.trim().slice(0, 2000) : '';
        if (!content) return;

        let msg: {
          id: string
          room_id: number
          user_id: string
          username: string
          content: string
          created_at: string
        };

        try {
          const ins = await pool.query<{
            id: string
            room_id: number
            user_id: string
            content: string
            created_at: Date
          }>(
            `INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3)
             RETURNING id, room_id, user_id, content, created_at`,
            [roomId, u.sub, content]
          );
          const row = ins.rows[0];
          if (!row) return;
          msg = {
            id: row.id,
            room_id: row.room_id,
            user_id: row.user_id,
            username: u.username,
            content: row.content,
            created_at: row.created_at.toISOString(),
          };
        } catch (e) {
          console.error('chat persist failed', e);
          return;
        }

        nsp.emit('chat:message', msg);
      });

      socket.on('disconnect', () => {
        players.delete(socket.id);
        broadcastPlayers();
      });
    });
  }
}
