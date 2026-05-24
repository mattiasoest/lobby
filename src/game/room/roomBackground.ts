export function backgroundTextureSrcForRoomId(roomId: number, grassSrc: string, snowSrc: string): string {
  return (roomId | 0) === 4 ? snowSrc : grassSrc;
}

/** Pixi clear color behind the tiled world texture. */
export function backgroundColorForRoomId(roomId: number): number {
  return (roomId | 0) === 4 ? 0x1a2a38 : 0x1a2e1a;
}
