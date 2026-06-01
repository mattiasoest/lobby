import { ROOM_TILE_SIZE, ROOM_WORLD_COLS, ROOM_WORLD_ROWS } from '@/utils/canvasLoaderLayout.ts';

function worldSpawnPx() {
  const pad = ROOM_TILE_SIZE * 0.14;
  const size = ROOM_TILE_SIZE - pad * 2;
  const worldWidthPx = ROOM_WORLD_COLS * ROOM_TILE_SIZE;
  const worldHeightPx = ROOM_WORLD_ROWS * ROOM_TILE_SIZE;
  return { x: worldWidthPx / 2 - size / 2, y: worldHeightPx / 2 - size / 2 };
}

const SPAWN_JITTER_PX = 125;

/** Random offset ±{@link SPAWN_JITTER_PX} on each axis from map center (world top-left of avatar). */
export function jitterAroundWorldSpawn() {
  const base = worldSpawnPx();
  const spawnJitterRadiusPx = SPAWN_JITTER_PX;
  return {
    x: base.x + (Math.random() * 2 * spawnJitterRadiusPx - spawnJitterRadiusPx),
    y: base.y + (Math.random() * 2 * spawnJitterRadiusPx - spawnJitterRadiusPx),
  };
}
