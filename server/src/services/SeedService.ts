import { getRoomChatNpcConfig } from '../domain/chatNpc.js';
import { ROOM_IDS } from '../shared/rooms.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { users } from '../infrastructure/db/schema.js';

export class SeedService {
  constructor(private readonly db: AppDatabase) {}

  /** Idempotent seed: one bot user per room for ChatNpc chat authorship. */
  async ensureChatNpcUsers(): Promise<void> {
    for (const roomId of ROOM_IDS) {
      const chatNpc = getRoomChatNpcConfig(roomId);
      if (!chatNpc) continue;
      await this.db
        .insert(users)
        .values({
          id: chatNpc.userId,
          provider: 'system',
          providerId: `npc-room-${roomId}`,
          username: chatNpc.username,
          avatar: null,
          avatarId: 'default',
        })
        .onConflictDoNothing();
    }
  }
}
