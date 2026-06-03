import type { RoomId } from './rooms.js';

/** Fixed UUIDs for room ChatNpc users (shared by client and server). */
export const CHAT_NPC_USER_IDS = {
  1: '00000000-0000-4000-8000-000000000001',
  2: '00000000-0000-4000-8000-000000000002',
  3: '00000000-0000-4000-8000-000000000003',
  4: '00000000-0000-4000-8000-000000000004',
} as const satisfies Record<RoomId, string>;
