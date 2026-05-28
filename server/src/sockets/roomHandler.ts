import type { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { sanitizeAvatarId } from '../avatars.js';
import type { AppDatabase } from '../db/client.js';
import { messages, users } from '../db/schema.js';
import { maskProfanity } from '../lib/profanity.js';

const TILE_PX = 32;
const WORLD_COLS_CONST = 48;
const WORLD_ROWS_CONST = 32;

function clampPlayerPx(rawX: unknown, rawY: unknown): { x: number; y: number } {
  const pad = TILE_PX * 0.14;
  const size = TILE_PX - pad * 2;
  const worldWidthPx = WORLD_COLS_CONST * TILE_PX;
  const worldHeightPx = WORLD_ROWS_CONST * TILE_PX;
  const min = pad;
  const maxX = worldWidthPx - pad - size;
  const maxY = worldHeightPx - pad - size;
  const nx = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : min;
  const ny = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : min;
  return {
    x: Math.min(Math.max(nx, min), maxX),
    y: Math.min(Math.max(ny, min), maxY),
  };
}

export const ROOM_IDS = [1, 2, 3, 4] as const;

export type PlayerPublic = {
  id: string;
  username: string;
  x: number;
  y: number;
  userId: string;
  avatarId: string;
};

export function registerRoomNamespaces(io: Server, opts: { jwtSecret: string; db: AppDatabase }) {
  const { jwtSecret, db } = opts;

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
        const payload = jwt.verify(raw, jwtSecret) as {
          sub: string;
          username: string;
        };
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
      socket.on('player:join', async (payload: { x: number; y: number }) => {
        const authedUser = socket.data.user as { sub: string; username: string };
        const clampedPosition = clampPlayerPx(payload.x, payload.y);
        let avatarId = sanitizeAvatarId(undefined);
        try {
          const rows = await db
            .select({ avatarId: users.avatarId })
            .from(users)
            .where(eq(users.id, authedUser.sub))
            .limit(1);
          avatarId = sanitizeAvatarId(rows[0]?.avatarId);
        } catch (error) {
          console.error('player:join avatar lookup failed', error);
        }
        players.set(socket.id, {
          id: socket.id,
          username: authedUser.username,
          x: clampedPosition.x,
          y: clampedPosition.y,
          userId: authedUser.sub,
          avatarId,
        });
        broadcastPlayers();
      });

      socket.on('player:move', (payload: { x: number; y: number }) => {
        const row = players.get(socket.id);
        if (!row) return;
        const clampedPosition = clampPlayerPx(payload.x, payload.y);
        row.x = clampedPosition.x;
        row.y = clampedPosition.y;
        broadcastPlayers();
      });

      socket.on('player:leave', () => {
        players.delete(socket.id);
        broadcastPlayers();
      });

      socket.on('chat:send', async (payload: { content: string }) => {
        const authedUser = socket.data.user as { sub: string; username: string };
        const raw = typeof payload?.content === 'string' ? payload.content.trim().slice(0, 2000) : '';
        if (!raw) return;
        const content = maskProfanity(raw);

        let msg: {
          id: string;
          room_id: number;
          user_id: string;
          username: string;
          content: string;
          created_at: string;
        };

        try {
          const ins = await db
            .insert(messages)
            .values({
              roomId,
              userId: authedUser.sub,
              content,
              contentRaw: raw,
            })
            .returning({
              id: messages.id,
              roomId: messages.roomId,
              userId: messages.userId,
              content: messages.content,
              createdAt: messages.createdAt,
            });
          const row = ins[0];
          if (!row) return;
          msg = {
            id: row.id,
            room_id: row.roomId,
            user_id: row.userId,
            username: authedUser.username,
            content: row.content,
            created_at: row.createdAt.toISOString(),
          };
        } catch (error) {
          console.error('chat persist failed', error);
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
