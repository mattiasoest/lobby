export const ROOM_IDS = [1, 2, 3, 4] as const;
export type RoomId = (typeof ROOM_IDS)[number];

const VALID_ROOMS = new Set<number>(ROOM_IDS);

export function isValidRoomId(roomId: number): boolean {
  return VALID_ROOMS.has(roomId);
}
