import type { AppDatabase } from './client.js';
import { users } from './schema.js';
import { getRoomChatNpcConfig, ROOM_IDS } from '../sockets/chatNpcConfig.js';

/** Idempotent seed: one bot user per room for ChatNpc chat authorship. */
export async function ensureChatNpcUsers(db: AppDatabase): Promise<void> {
  for (const roomId of ROOM_IDS) {
    const chatNpc = getRoomChatNpcConfig(roomId);
    if (!chatNpc) continue;
    await db
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
