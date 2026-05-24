export function backgroundTextureSrcForRoomId(roomId: number, grassSrc: string, snowSrc: string): string {
  return (roomId | 0) === 4 ? snowSrc : grassSrc;
}
