export function backgroundTextureSrcForRoomId(
  roomId: number,
  grassSrc: string,
  spaceSrc: string,
  desertSrc: string,
  snowSrc: string,
): string {
  const id = roomId | 0;
  if (id === 4) return snowSrc;
  if (id === 3) return desertSrc;
  if (id === 2) return spaceSrc;
  return grassSrc;
}
