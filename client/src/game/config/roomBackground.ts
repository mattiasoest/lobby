export function backgroundTextureSrcForRoomId(
  roomId: number,
  grassSrc: string,
  spaceSrc: string,
  snowSrc: string,
): string {
  const id = roomId | 0;
  if (id === 4) return snowSrc;
  if (id === 2) return spaceSrc;
  return grassSrc;
}
