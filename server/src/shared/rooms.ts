/** Allowed room identifiers for routes and socket namespaces. */
export const ROOM_IDS = [1, 2, 3, 4] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export function isRoomId(value: unknown): value is RoomId {
  const numericRoom = Number(value);
  return ROOM_IDS.includes(numericRoom as RoomId);
}
