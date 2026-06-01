import type { Server, Namespace } from 'socket.io';
import jwt from 'jsonwebtoken';
import { desc, eq } from 'drizzle-orm';
import { sanitizeAvatarId } from '../avatars.js';
import type { AppDatabase } from '../db/client.js';
import { messages, users } from '../db/schema.js';
import { generateChatNpcReply, type GroqChatMessage } from '../lib/groq.js';
import { maskProfanity } from '../lib/profanity.js';
import { ChatNpcRateLimiter } from './chatNpcRateLimiter.js';
import {
  getRoomChatNpcConfig,
  chatNpcMentionIncludesMessage,
  messageMentionsChatNpc,
  pickRandomChatNpcFallbackMessage,
  ROOM_IDS,
  type RoomChatNpcConfig,
} from './chatNpcConfig.js';

export { ROOM_IDS };

const TILE_PX = 32;
const WORLD_COLS_CONST = 48;
const WORLD_ROWS_CONST = 32;

/**
 * Fixed rate at which we re-broadcast moving players. Clients may send `player:move` far faster
 * (up to their render rate); we coalesce those into one snapshot per tick so fan-out stays
 * O(players) per tick instead of O(moves) — this is what keeps production from flooding and
 * jittering. Roster changes (join/leave) flush immediately regardless of the tick.
 */
const BROADCAST_HZ = 20;
const BROADCAST_INTERVAL_MS = Math.round(1000 / BROADCAST_HZ);

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

export type PlayerPublic = {
  id: string;
  username: string;
  x: number;
  y: number;
  userId: string;
  avatarId: string;
};

/**
 * `t` is the server send time (Date.now, ms). Clients replay remote movement on a timeline anchored
 * to these timestamps so per-packet network jitter doesn't distort the motion.
 */
export type PlayersUpdate = {
  t: number;
  players: PlayerPublic[];
};

type ChatMessagePayload = {
  id: string;
  room_id: number;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
};

const chatNpcRateLimiter = new ChatNpcRateLimiter();
const NPC_TYPING_DELAY_MS = 600;
const NPC_HISTORY_LIMIT = 10;

async function loadRecentRoomHistory(
  db: AppDatabase,
  roomId: number,
  chatNpc: RoomChatNpcConfig,
): Promise<GroqChatMessage[]> {
  const rows = await db
    .select({
      userId: messages.userId,
      content: messages.content,
      username: users.username,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.createdAt))
    .limit(NPC_HISTORY_LIMIT);

  return rows
    .reverse()
    .map((row) =>
      row.userId === chatNpc.userId
        ? ({ role: 'assistant', content: row.content } satisfies GroqChatMessage)
        : ({ role: 'user', content: `${row.username}: ${row.content}` } satisfies GroqChatMessage),
    );
}

async function persistAndEmitChatMessage(
  db: AppDatabase,
  nsp: Namespace,
  roomId: number,
  userId: string,
  username: string,
  content: string,
  contentRaw: string,
): Promise<ChatMessagePayload | null> {
  try {
    const ins = await db
      .insert(messages)
      .values({
        roomId,
        userId,
        content,
        contentRaw,
      })
      .returning({
        id: messages.id,
        roomId: messages.roomId,
        userId: messages.userId,
        content: messages.content,
        createdAt: messages.createdAt,
      });
    const row = ins[0];
    if (!row) return null;
    const msg: ChatMessagePayload = {
      id: row.id,
      room_id: row.roomId,
      user_id: row.userId,
      username,
      content: row.content,
      created_at: row.createdAt.toISOString(),
    };
    nsp.emit('chat:message', msg);
    return msg;
  } catch (error) {
    console.error('chat persist failed', error);
    return null;
  }
}

async function maybeReplyAsChatNpc(
  db: AppDatabase,
  nsp: Namespace,
  roomId: number,
  userContent: string,
  groqApiKey: string | undefined,
): Promise<void> {
  const chatNpc = getRoomChatNpcConfig(roomId);
  if (!chatNpc) return;
  if (!messageMentionsChatNpc(userContent, chatNpc.username)) return;
  if (!chatNpcMentionIncludesMessage(userContent, chatNpc.username)) return;
  if (!chatNpcRateLimiter.canReplyInRoom(roomId)) return;

  let reply: string | null = null;
  if (groqApiKey && chatNpcRateLimiter.canCallGroq()) {
    chatNpcRateLimiter.consumeGroqSlot();
    const history = await loadRecentRoomHistory(db, roomId, chatNpc);
    reply = await generateChatNpcReply({
      systemPrompt: chatNpc.systemPrompt,
      history,
      model: chatNpc.primaryModel,
      fallbackModel: chatNpc.fallbackModel,
      apiKey: groqApiKey,
    });
  }

  if (!reply) {
    reply = pickRandomChatNpcFallbackMessage();
  }

  chatNpcRateLimiter.markReplied(roomId);

  await new Promise((resolve) => setTimeout(resolve, NPC_TYPING_DELAY_MS));
  const masked = maskProfanity(reply);
  await persistAndEmitChatMessage(db, nsp, roomId, chatNpc.userId, chatNpc.username, masked, reply);
}

export function registerRoomNamespaces(
  io: Server,
  opts: { jwtSecret: string; db: AppDatabase; groqApiKey?: string },
) {
  const { jwtSecret, db, groqApiKey } = opts;

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
    /** Set when positions change between ticks; the broadcast tick only emits when something moved. */
    let movesPending = false;

    const emitPlayers = () => {
      const payload: PlayersUpdate = { t: Date.now(), players: [...players.values()] };
      nsp.emit('players:update', payload);
    };

    /** Roster changes (join/leave) must propagate now, not on the next tick. */
    const flushNow = () => {
      movesPending = false;
      emitPlayers();
    };

    const broadcastTimer = setInterval(() => {
      if (!movesPending) return;
      movesPending = false;
      emitPlayers();
    }, BROADCAST_INTERVAL_MS);
    // Don't keep the process alive solely for this timer (namespaces live for the server's lifetime).
    broadcastTimer.unref?.();

    nsp.on('connection', (socket) => {
      /** One-shot clock sync so clients sample animal tours against server time. */
      socket.emit('room:clock', { serverNowMs: Date.now() });

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
        flushNow();
      });

      socket.on('player:move', (payload: { x: number; y: number }) => {
        const row = players.get(socket.id);
        if (!row) return;
        const clampedPosition = clampPlayerPx(payload.x, payload.y);
        row.x = clampedPosition.x;
        row.y = clampedPosition.y;
        // Coalesced into the next broadcast tick rather than re-emitted per move.
        movesPending = true;
      });

      socket.on('player:leave', () => {
        players.delete(socket.id);
        flushNow();
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
        void maybeReplyAsChatNpc(db, nsp, roomId, raw, groqApiKey);
      });

      socket.on('disconnect', () => {
        players.delete(socket.id);
        flushNow();
      });
    });
  }
}
