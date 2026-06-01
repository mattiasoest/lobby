import {
  ENTITY_COLLISION_SIZE_PX,
  ENTITY_OVERLAP_RESOLVE_PX_PER_SEC,
  MAX_REMOTE_SEGMENT_MS,
  REMOTE_RENDER_DELAY_MAX_MS,
  REMOTE_RENDER_DELAY_MIN_MS,
} from './constants.ts';

export type RemoteSample = { time: number; x: number; y: number };

/** Entity top-left for player-sized obstacles; optional width/height for static rects (e.g. merchant stall). */
export type EntityObstacle = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type Aabb = { x: number; y: number; w: number; h: number };

function obstacleAabb(obs: EntityObstacle, tileSize: number): Aabb {
  if (obs.width != null && obs.height != null) {
    return { x: obs.x, y: obs.y, w: obs.width, h: obs.height };
  }
  const inset = entityCollisionInset(tileSize);
  const collSize = ENTITY_COLLISION_SIZE_PX;
  return { x: obs.x + inset, y: obs.y + inset, w: collSize, h: collSize };
}

function playerCollisionAabb(topLeftX: number, topLeftY: number, tileSize: number): Aabb {
  const inset = entityCollisionInset(tileSize);
  const collSize = ENTITY_COLLISION_SIZE_PX;
  return { x: topLeftX + inset, y: topLeftY + inset, w: collSize, h: collSize };
}

function aabbRectOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function dropRemoteStaleAnchors(samples: RemoteSample[]): void {
  while (samples.length >= 2) {
    const firstSample = samples[0];
    const secondSample = samples[1];
    if (secondSample.time - firstSample.time > MAX_REMOTE_SEGMENT_MS) {
      samples.shift();
    } else {
      break;
    }
  }
}

export function remoteRenderDelayMs(samples: RemoteSample[]): number {
  // Prefer the deep end of the buffer — shallow playback is what causes hold-then-jump flicker.
  if (samples.length <= 1) return REMOTE_RENDER_DELAY_MAX_MS;
  const span = REMOTE_RENDER_DELAY_MAX_MS - REMOTE_RENDER_DELAY_MIN_MS;
  const depth = clamp((samples.length - 2) / 2, 0, 1);
  return REMOTE_RENDER_DELAY_MIN_MS + span * depth;
}

export function smoothstep01(unitT: number) {
  const clampedUnit = clamp(unitT, 0, 1);
  return clampedUnit * clampedUnit * (3 - 2 * clampedUnit);
}

export function posFromRemoteBuffer(samples: RemoteSample[], playbackTime: number): { x: number; y: number } {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1) return { x: samples[0].x, y: samples[0].y };

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (playbackTime <= first.time) return { x: first.x, y: first.y };
  if (playbackTime >= last.time) return { x: last.x, y: last.y };

  for (let segmentIndex = 0; segmentIndex < samples.length - 1; segmentIndex++) {
    const segmentStart = samples[segmentIndex];
    const segmentEnd = samples[segmentIndex + 1];
    if (playbackTime <= segmentEnd.time) {
      const span = segmentEnd.time - segmentStart.time;
      const linearMix = span < 1e-6 ? 0 : clamp((playbackTime - segmentStart.time) / span, 0, 1);
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * linearMix,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * linearMix,
      };
    }
  }
  return { x: last.x, y: last.y };
}

export function scrollWorldPx(
  avatarLeft: number,
  avatarTop: number,
  avatarSize: number,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
) {
  const cx = avatarLeft + avatarSize / 2;
  const cy = avatarTop + avatarSize / 2;
  const maxLeft = Math.max(0, worldW - viewW);
  const maxTop = Math.max(0, worldH - viewH);
  return {
    left: clamp(cx - viewW / 2, 0, maxLeft),
    top: clamp(cy - viewH / 2, 0, maxTop),
  };
}

/** Inner padded quad used for world bounds and sprite alignment. */
export function entityInnerQuad(tileSize: number) {
  const pad = tileSize * 0.14;
  const size = tileSize - pad * 2;
  return { pad, size };
}

/** Inset from entity top-left to the smaller entity–entity collision box. */
export function entityCollisionInset(tileSize: number): number {
  const { size } = entityInnerQuad(tileSize);
  return (size - ENTITY_COLLISION_SIZE_PX) / 2;
}

export function aabbOverlap(ax: number, ay: number, bx: number, by: number, size: number): boolean {
  return ax < bx + size && ax + size > bx && ay < by + size && ay + size > by;
}

export function entityCollidesWithAny(
  topLeftX: number,
  topLeftY: number,
  others: ReadonlyArray<EntityObstacle>,
  tileSize: number,
): boolean {
  if (others.length === 0) return false;
  const player = playerCollisionAabb(topLeftX, topLeftY, tileSize);
  for (const other of others) {
    if (aabbRectOverlap(player, obstacleAabb(other, tileSize))) return true;
  }
  return false;
}

export function entityCollisionCenter(topLeftX: number, topLeftY: number, tileSize: number): { x: number; y: number } {
  const inset = entityCollisionInset(tileSize);
  const half = ENTITY_COLLISION_SIZE_PX / 2;
  return { x: topLeftX + inset + half, y: topLeftY + inset + half };
}

function overlap1DRect(aMin: number, aSize: number, bMin: number, bSize: number): number {
  return Math.min(aMin + aSize, bMin + bSize) - Math.max(aMin, bMin);
}

function overlaps1DRect(aMin: number, aSize: number, bMin: number, bSize: number): boolean {
  return aMin < bMin + bSize && aMin + aSize > bMin;
}

/**
 * Block a single-axis move against an obstacle on that axis.
 * Caller guarantees the OTHER axis already overlaps (so a same-axis overlap means full AABB overlap).
 *
 * Behavior:
 *   - If the new position doesn't overlap on this axis, accept the move.
 *   - If the new position overlaps and we WEREN'T overlapping before, snap to the obstacle edge.
 *   - If we were already overlapping (e.g. spawn coincidence or someone pushed onto us), only
 *     refuse moves that increase overlap depth. Allow moves that reduce it (escape).
 *   - Never teleport: the returned position is between {@link prevPos} and {@link newPos}.
 */
function blockAxisAgainstRect(
  prevPos: number,
  newPos: number,
  playerSize: number,
  obsPos: number,
  obsSize: number,
): number {
  if (!overlaps1DRect(newPos, playerSize, obsPos, obsSize)) return newPos;

  if (overlaps1DRect(prevPos, playerSize, obsPos, obsSize)) {
    const prevDepth = overlap1DRect(prevPos, playerSize, obsPos, obsSize);
    const newDepth = overlap1DRect(newPos, playerSize, obsPos, obsSize);
    return newDepth <= prevDepth ? newPos : prevPos;
  }

  const delta = newPos - prevPos;
  return delta > 0 ? obsPos - playerSize : obsPos + obsSize;
}

/**
 * Resolve an existing overlap (e.g. a remote player snapped into us via network jitter).
 * Steps gently — capped at {@link ENTITY_OVERLAP_RESOLVE_PX_PER_SEC} per second — so we never
 * teleport. Always pushes along the shallowest axis.
 */
export function resolveEntityOverlaps(
  topLeftX: number,
  topLeftY: number,
  obstacles: ReadonlyArray<EntityObstacle>,
  tileSize: number,
  worldCols: number,
  worldRows: number,
  dtSec: number,
  /** When set, caps per-pass separation distance; omit for the default soft remote-player cap. */
  maxStepPx?: number,
): { x: number; y: number } {
  if (obstacles.length === 0) {
    return clampWorldTopLeft(topLeftX, topLeftY, tileSize, worldCols, worldRows);
  }

  const inset = entityCollisionInset(tileSize);
  const maxStep = maxStepPx ?? ENTITY_OVERLAP_RESOLVE_PX_PER_SEC * Math.max(dtSec, 1e-4);
  const player = playerCollisionAabb(topLeftX, topLeftY, tileSize);
  const maxPasses = Math.max(1, obstacles.length);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const obs of obstacles) {
      const obsAabb = obstacleAabb(obs, tileSize);
      if (!aabbRectOverlap(player, obsAabb)) continue;
      const ox = overlap1DRect(player.x, player.w, obsAabb.x, obsAabb.w);
      const oy = overlap1DRect(player.y, player.h, obsAabb.y, obsAabb.h);
      if (ox <= 0 || oy <= 0) continue;

      if (ox < oy) {
        const push = Math.min(ox, maxStep);
        player.x += player.x < obsAabb.x ? -push : push;
      } else {
        const push = Math.min(oy, maxStep);
        player.y += player.y < obsAabb.y ? -push : push;
      }
      moved = true;
    }
    if (!moved) break;
  }

  return clampWorldTopLeft(player.x - inset, player.y - inset, tileSize, worldCols, worldRows);
}

/**
 * Axis-separated movement with AABB blocking against entity obstacles.
 *
 * `blockObstacles` (e.g. merchant stall + remote players) stop the move at their edge.
 * `resolveObstacles` (typically just remote players) are also gently separated post-move so
 * a remote player teleporting onto us doesn't leave us permanently overlapping.
 */
export function moveTopLeftWithEntityCollisions(
  fromX: number,
  fromY: number,
  deltaX: number,
  deltaY: number,
  blockObstacles: ReadonlyArray<EntityObstacle>,
  tileSize: number,
  worldCols: number,
  worldRows: number,
  dtSec: number,
  resolveObstacles: ReadonlyArray<EntityObstacle> = [],
): { x: number; y: number } {
  const playerSize = ENTITY_COLLISION_SIZE_PX;
  const inset = entityCollisionInset(tileSize);
  const startPlayer = playerCollisionAabb(fromX, fromY, tileSize);
  let x = fromX;
  let y = fromY;

  if (deltaX !== 0) {
    const candidateX = clampWorldTopLeft(x + deltaX, y, tileSize, worldCols, worldRows).x;
    let collX = candidateX + inset;
    const collY = y + inset;
    for (const obs of blockObstacles) {
      const obsAabb = obstacleAabb(obs, tileSize);
      if (!overlaps1DRect(collY, playerSize, obsAabb.y, obsAabb.h)) continue;
      collX = blockAxisAgainstRect(startPlayer.x, collX, playerSize, obsAabb.x, obsAabb.w);
    }
    x = collX - inset;
  }

  if (deltaY !== 0) {
    const candidateY = clampWorldTopLeft(x, y + deltaY, tileSize, worldCols, worldRows).y;
    const collX = x + inset;
    let collY = candidateY + inset;
    for (const obs of blockObstacles) {
      const obsAabb = obstacleAabb(obs, tileSize);
      if (!overlaps1DRect(collX, playerSize, obsAabb.x, obsAabb.w)) continue;
      collY = blockAxisAgainstRect(startPlayer.y, collY, playerSize, obsAabb.y, obsAabb.h);
    }
    y = collY - inset;
  }

  if (resolveObstacles.length > 0) {
    return resolveEntityOverlaps(x, y, resolveObstacles, tileSize, worldCols, worldRows, dtSec);
  }
  return clampWorldTopLeft(x, y, tileSize, worldCols, worldRows);
}

export function clampWorldTopLeft(
  topLeftX: number,
  topLeftY: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
) {
  const { pad, size } = entityInnerQuad(tileSize);
  const worldWidth = worldCols * tileSize;
  const worldHeight = worldRows * tileSize;
  return {
    x: clamp(topLeftX, pad, worldWidth - pad - size),
    y: clamp(topLeftY, pad, worldHeight - pad - size),
  };
}
