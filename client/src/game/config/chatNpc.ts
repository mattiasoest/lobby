import { Merchant } from '../entities/Merchant.ts';

/** Fixed UUIDs shared with the server (`server/src/sockets/chatNpcConfig.ts`). */
export const CHAT_NPC_USER_IDS = {
  1: '00000000-0000-4000-8000-000000000001',
  2: '00000000-0000-4000-8000-000000000002',
  3: '00000000-0000-4000-8000-000000000003',
  4: '00000000-0000-4000-8000-000000000004',
} as const;

/** Minimap dot + interact marker green (tailwind green-500). */
export const CHAT_NPC_MARKER_COLOR = 0x22c55e;
export const CHAT_NPC_MARKER_COLOR_CSS = '#22c55e';

export type RoomChatNpcInfo = {
  userId: string;
  username: string;
};

const ROOM_CHAT_NPC_BY_ID: Record<number, RoomChatNpcInfo> = {
  1: { userId: CHAT_NPC_USER_IDS[1], username: 'Grunk' },
  2: { userId: CHAT_NPC_USER_IDS[2], username: 'Snazz' },
  3: { userId: CHAT_NPC_USER_IDS[3], username: 'Slog' },
  4: { userId: CHAT_NPC_USER_IDS[4], username: 'Crunch' },
};

export function getRoomChatNpc(roomId: number): RoomChatNpcInfo | null {
  return ROOM_CHAT_NPC_BY_ID[roomId] ?? null;
}

export function isRoomChatNpcUserId(userId: string, roomId: number): boolean {
  const chatNpc = getRoomChatNpc(roomId);
  return !!chatNpc && chatNpc.userId === userId;
}

/** Deterministic world anchor (top-left of merchant stall bounds) per room. */
export function chatNpcAnchorPx(
  roomId: number,
  _tileSize: number,
  worldCols: number,
  worldRows: number,
): { x: number; y: number } {
  const worldW = worldCols * _tileSize;
  const worldH = worldRows * _tileSize;
  const width = Merchant.displayWidth;
  const height = Merchant.displayHeight;
  const min = 0;
  const maxX = worldW - width;
  const maxY = worldH - height;

  const anchors: Record<number, { x: number; y: number }> = {
    1: { x: worldW * 0.35, y: worldH * 0.4 },
    2: { x: worldW * 0.65, y: worldH * 0.35 },
    3: { x: worldW * 0.3, y: worldH * 0.55 },
    4: { x: worldW * 0.6, y: worldH * 0.5 },
  };
  const raw = anchors[roomId] ?? anchors[1];
  return {
    x: Math.min(Math.max(raw.x, min), maxX),
    y: Math.min(Math.max(raw.y, min), maxY),
  };
}
