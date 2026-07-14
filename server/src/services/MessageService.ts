import { asc, eq } from 'drizzle-orm';
import { isRoomId } from '../shared/rooms.js';
import { maskProfanity } from '../infrastructure/content/profanity.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { messages, users } from '../infrastructure/db/schema.js';

export type ChatMessagePayload = {
  id: string;
  room_id: number;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
};

const HISTORY_LIMIT = 500;

function toPayload(
  row: {
    id: string;
    roomId: number;
    userId: string;
    content: string;
    createdAt: Date;
  },
  username: string,
): ChatMessagePayload {
  return {
    id: row.id,
    room_id: row.roomId,
    user_id: row.userId,
    username,
    content: row.content,
    created_at: row.createdAt.toISOString(),
  };
}

export class MessageService {
  constructor(private readonly db: AppDatabase) {}

  async sendChatMessage(
    roomId: number,
    userId: string,
    username: string,
    raw: string,
  ): Promise<ChatMessagePayload | null> {
    const trimmed = raw.trim().slice(0, 2000);
    if (!trimmed) return null;
    return this.insertMessage(roomId, userId, username, maskProfanity(trimmed), trimmed);
  }

  async getRoomHistory(roomId: number): Promise<ChatMessagePayload[] | null> {
    if (!isRoomId(roomId)) return null;
    const rows = await this.db
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
      .where(eq(messages.roomId, roomId))
      .orderBy(asc(messages.createdAt))
      .limit(HISTORY_LIMIT);
    return rows.map((row) => ({
      ...toPayload(row, row.username),
      content: maskProfanity(row.content),
    }));
  }

  async insertNpcMessage(
    roomId: number,
    userId: string,
    username: string,
    raw: string,
  ): Promise<ChatMessagePayload | null> {
    return this.insertMessage(roomId, userId, username, maskProfanity(raw), raw);
  }

  private async insertMessage(
    roomId: number,
    userId: string,
    username: string,
    content: string,
    contentRaw: string,
  ): Promise<ChatMessagePayload | null> {
    const ins = await this.db
      .insert(messages)
      .values({ roomId, userId, content, contentRaw })
      .returning({
        id: messages.id,
        roomId: messages.roomId,
        userId: messages.userId,
        content: messages.content,
        createdAt: messages.createdAt,
      });
    const row = ins[0];
    if (!row) return null;
    return toPayload(row, username);
  }
}
