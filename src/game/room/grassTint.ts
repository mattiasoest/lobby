/** Alpha for the color wash drawn above the tiled grass (below avatars). Normal blend so it shows consistently on WebGL/WebGPU. */
export const GRASS_OVERLAY_ALPHA = 0.26;

/**
 * Fill color (0xRRGGBB) for the translucent wash above grass.jpg — sits between texture and avatars.
 */
const ROOM_GRASS_CASTS: readonly number[] = [
  0xfff4e0, // warm / late sun
  0xd8f2ff, // cool / overcast blue-green
  0xe8ffd8, // bright spring yellow-green
  0xf0e8ff, // soft violet shadow
  0xffefd8, // dry straw
  0xd8fff5, // teal dew
  0xf5ffe8, // yellow-lime
  0xe8ecff, // muted blue hour
];

/** No modulation — original grass.jpg appearance (used for room 1). */
export const GRASS_TINT_NEUTRAL = 0xffffff;

export function grassTintForRoomId(roomId: number): number {
  if ((roomId | 0) === 1) return GRASS_TINT_NEUTRAL;
  const u = (Math.imul(roomId | 0, 2654435761) + (roomId | 0)) >>> 0;
  return ROOM_GRASS_CASTS[u % ROOM_GRASS_CASTS.length]!;
}
