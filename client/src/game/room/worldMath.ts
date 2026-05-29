import {
  ENTITY_COLLISION_SIZE_PX,
  ENTITY_OVERLAP_RESOLVE_PX_PER_SEC,
  MAX_REMOTE_SEGMENT_MS,
  REMOTE_RENDER_DELAY_MAX_MS,
  REMOTE_RENDER_DELAY_MIN_MS,
} from './constants.ts';

export type RemoteSample = { time: number; x: number; y: number };

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
  if (samples.length <= 2) return REMOTE_RENDER_DELAY_MIN_MS;
  const span = REMOTE_RENDER_DELAY_MAX_MS - REMOTE_RENDER_DELAY_MIN_MS;
  const depth = clamp((samples.length - 2) / 3, 0, 1);
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
      const easedMix = smoothstep01(linearMix);
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * easedMix,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * easedMix,
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
  others: ReadonlyArray<{ x: number; y: number }>,
  tileSize: number,
): boolean {
  if (others.length === 0) return false;
  const collSize = ENTITY_COLLISION_SIZE_PX;
  const inset = entityCollisionInset(tileSize);
  const collX = topLeftX + inset;
  const collY = topLeftY + inset;
  for (const other of others) {
    const obsCollX = other.x + inset;
    const obsCollY = other.y + inset;
    if (aabbOverlap(collX, collY, obsCollX, obsCollY, collSize)) return true;
  }
  return false;
}

export function entityCollisionCenter(topLeftX: number, topLeftY: number, tileSize: number): { x: number; y: number } {
  const inset = entityCollisionInset(tileSize);
  const half = ENTITY_COLLISION_SIZE_PX / 2;
  return { x: topLeftX + inset + half, y: topLeftY + inset + half };
}

function overlap1D(aMin: number, bMin: number, size: number): number {
  return Math.min(aMin + size, bMin + size) - Math.max(aMin, bMin);
}

function overlaps1D(aMin: number, bMin: number, size: number): boolean {
  return aMin < bMin + size && aMin + size > bMin;
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
function blockAxisAgainstObstacle(prevPos: number, newPos: number, obsPos: number, collSize: number): number {
  if (!overlaps1D(newPos, obsPos, collSize)) return newPos;

  if (overlaps1D(prevPos, obsPos, collSize)) {
    const prevDepth = overlap1D(prevPos, obsPos, collSize);
    const newDepth = overlap1D(newPos, obsPos, collSize);
    return newDepth <= prevDepth ? newPos : prevPos;
  }

  const delta = newPos - prevPos;
  return delta > 0 ? obsPos - collSize : obsPos + collSize;
}

/**
 * Resolve an existing overlap (e.g. a remote player snapped into us via network jitter).
 * Steps gently — capped at {@link ENTITY_OVERLAP_RESOLVE_PX_PER_SEC} per second — so we never
 * teleport. Always pushes along the shallowest axis.
 */
export function resolveEntityOverlaps(
  topLeftX: number,
  topLeftY: number,
  obstacles: ReadonlyArray<{ x: number; y: number }>,
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

  const collSize = ENTITY_COLLISION_SIZE_PX;
  const inset = entityCollisionInset(tileSize);
  const maxStep = maxStepPx ?? ENTITY_OVERLAP_RESOLVE_PX_PER_SEC * Math.max(dtSec, 1e-4);
  let collX = topLeftX + inset;
  let collY = topLeftY + inset;
  const maxPasses = Math.max(1, obstacles.length);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const obs of obstacles) {
      const obsCollX = obs.x + inset;
      const obsCollY = obs.y + inset;
      if (!aabbOverlap(collX, collY, obsCollX, obsCollY, collSize)) continue;
      const ox = overlap1D(collX, obsCollX, collSize);
      const oy = overlap1D(collY, obsCollY, collSize);
      if (ox <= 0 || oy <= 0) continue;

      if (ox < oy) {
        const push = Math.min(ox, maxStep);
        collX += collX < obsCollX ? -push : push;
      } else {
        const push = Math.min(oy, maxStep);
        collY += collY < obsCollY ? -push : push;
      }
      moved = true;
    }
    if (!moved) break;
  }

  return clampWorldTopLeft(collX - inset, collY - inset, tileSize, worldCols, worldRows);
}

/**
 * Axis-separated movement with AABB blocking against same-size entity quads.
 *
 * `blockObstacles` (e.g. animals + remote players) stop the move at their edge.
 * `resolveObstacles` (typically just remote players) are also gently separated post-move so
 * a remote player teleporting onto us doesn't leave us permanently overlapping.
 */
export function moveTopLeftWithEntityCollisions(
  fromX: number,
  fromY: number,
  deltaX: number,
  deltaY: number,
  blockObstacles: ReadonlyArray<{ x: number; y: number }>,
  tileSize: number,
  worldCols: number,
  worldRows: number,
  dtSec: number,
  resolveObstacles: ReadonlyArray<{ x: number; y: number }> = [],
): { x: number; y: number } {
  const collSize = ENTITY_COLLISION_SIZE_PX;
  const inset = entityCollisionInset(tileSize);
  const startCollX = fromX + inset;
  const startCollY = fromY + inset;
  let x = fromX;
  let y = fromY;

  if (deltaX !== 0) {
    const candidateX = clampWorldTopLeft(x + deltaX, y, tileSize, worldCols, worldRows).x;
    let collX = candidateX + inset;
    const collY = y + inset;
    for (const obs of blockObstacles) {
      const obsCollX = obs.x + inset;
      const obsCollY = obs.y + inset;
      if (!overlaps1D(collY, obsCollY, collSize)) continue;
      collX = blockAxisAgainstObstacle(startCollX, collX, obsCollX, collSize);
    }
    x = collX - inset;
  }

  if (deltaY !== 0) {
    const candidateY = clampWorldTopLeft(x, y + deltaY, tileSize, worldCols, worldRows).y;
    const collX = x + inset;
    let collY = candidateY + inset;
    for (const obs of blockObstacles) {
      const obsCollX = obs.x + inset;
      const obsCollY = obs.y + inset;
      if (!overlaps1D(collX, obsCollX, collSize)) continue;
      collY = blockAxisAgainstObstacle(startCollY, collY, obsCollY, collSize);
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
