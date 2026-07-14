import { CHAT_NPC_USER_IDS, CHAT_NPC_USERNAMES } from '@shared/chatNpcIds';
import { Merchant } from '../entities/Merchant.ts';

export { CHAT_NPC_USER_IDS };

/** Minimap dot + interact marker green (tailwind green-500). */
export const CHAT_NPC_MARKER_COLOR = 0x22c55e;
export const CHAT_NPC_MARKER_COLOR_CSS = '#22c55e';

export type RoomChatNpcInfo = {
  userId: string;
  username: string;
};

const ROOM_CHAT_NPC_BY_ID: Record<number, RoomChatNpcInfo> = {
  1: { userId: CHAT_NPC_USER_IDS[1], username: CHAT_NPC_USERNAMES[1] },
  2: { userId: CHAT_NPC_USER_IDS[2], username: CHAT_NPC_USERNAMES[2] },
  3: { userId: CHAT_NPC_USER_IDS[3], username: CHAT_NPC_USERNAMES[3] },
  4: { userId: CHAT_NPC_USER_IDS[4], username: CHAT_NPC_USERNAMES[4] },
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

/** Extra padding around the stall so wandering NPCs do not overlap the merchant sprite. */
export const MERCHANT_NPC_CLEARANCE_PX = 48;

export type MerchantKeepOutRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Axis-aligned keep-out zone for NPC paths; `null` when the room has no chat NPC. */
export function merchantKeepOutRect(
  roomId: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): MerchantKeepOutRect | null {
  if (!getRoomChatNpc(roomId)) return null;
  const anchor = chatNpcAnchorPx(roomId, tileSize, worldCols, worldRows);
  const pad = MERCHANT_NPC_CLEARANCE_PX;
  return {
    left: anchor.x - pad,
    top: anchor.y - pad,
    right: anchor.x + Merchant.displayWidth + pad,
    bottom: anchor.y + Merchant.displayHeight + pad,
  };
}

export function pointInMerchantKeepOut(x: number, y: number, rect: MerchantKeepOutRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Whether an axis-aligned step from `(fromX, fromY)` to `(toX, toY)` enters the keep-out zone. */
export function axisLegIntersectsMerchantKeepOut(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rect: MerchantKeepOutRect,
): boolean {
  if (pointInMerchantKeepOut(toX, toY, rect)) return true;
  if (Math.abs(fromY - toY) < 1e-3) {
    const y = fromY;
    const xMin = Math.min(fromX, toX);
    const xMax = Math.max(fromX, toX);
    return y >= rect.top && y <= rect.bottom && xMax >= rect.left && xMin <= rect.right;
  }
  if (Math.abs(fromX - toX) < 1e-3) {
    const x = fromX;
    const yMin = Math.min(fromY, toY);
    const yMax = Math.max(fromY, toY);
    return x >= rect.left && x <= rect.right && yMax >= rect.top && yMin <= rect.bottom;
  }
  return false;
}

/** Push a point to the nearest edge outside the keep-out rect (still inside caller should clamp to world). */
export function nudgeAwayFromMerchantKeepOut(
  x: number,
  y: number,
  rect: MerchantKeepOutRect,
): { x: number; y: number } {
  if (!pointInMerchantKeepOut(x, y, rect)) return { x, y };
  const distLeft = x - rect.left;
  const distRight = rect.right - x;
  const distTop = y - rect.top;
  const distBottom = rect.bottom - y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return { x: rect.left - 1, y };
  if (min === distRight) return { x: rect.right + 1, y };
  if (min === distTop) return { x, y: rect.top - 1 };
  return { x, y: rect.bottom + 1 };
}
