import { chatNpcAnchorPx, getRoomChatNpc } from '../../config/chatNpc.ts';
import { Merchant } from '../../entities/Merchant.ts';
import { WALK_ENTITY_SPRITE_SIZE_PX } from '../../entities/npcs/WalkEntity.ts';
import type { NpcCardinalDirection } from './npcDirectionFrames.ts';
import { clamp01, fnv1aHash, mulberry32 } from './npcWander.ts';

/** Patrol walk speed (22 px/s base, 10% slower for animation sync). */
export const BOMBER_PATROL_MOVE_PX_PER_SEC = 19.8;
export const BOMBER_MERCHANT_IDLE_MIN_MS = 6000;
export const BOMBER_MERCHANT_IDLE_MAX_MS = 15000;
export const BOMBER_OFFSCREEN_IDLE_MIN_MS = 10000;
export const BOMBER_OFFSCREEN_IDLE_MAX_MS = 20000;
/** Top-left Y when the sprite has fully left the viewport upward. */
export const BOMBER_EXIT_Y_PX = -WALK_ENTITY_SPRITE_SIZE_PX - 8;
/** Top-left Y where the bomber reappears before walking back to the merchant. */
export const BOMBER_REAPPEAR_Y_PX = -WALK_ENTITY_SPRITE_SIZE_PX;
/** Offset east of the stall's right edge (12px gap minus 35px closer to merchant). */
export const BOMBER_PATRON_OFFSET_X_PX = -23;

export type BomberPatrolPoint = { x: number; y: number };

export type BomberPatrolPhase =
  | {
      kind: 'idle';
      startMs: number;
      endMs: number;
      x: number;
      y: number;
    }
  | {
      kind: 'move';
      startMs: number;
      endMs: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      direction: NpcCardinalDirection;
    }
  | {
      kind: 'hidden';
      startMs: number;
      endMs: number;
      x: number;
      y: number;
    };

export type BomberPatrolTimeline = {
  phases: BomberPatrolPhase[];
  cycleMs: number;
  merchant: BomberPatrolPoint;
  topLane: BomberPatrolPoint;
};

/** Patron stand on the stall's east side; patrol runs straight up from here. */
export function bomberPatronPoint(
  roomId: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): BomberPatrolPoint | null {
  if (!getRoomChatNpc(roomId)) return null;
  const anchor = chatNpcAnchorPx(roomId, tileSize, worldCols, worldRows);
  return {
    x: anchor.x + Merchant.displayWidth + BOMBER_PATRON_OFFSET_X_PX,
    y: anchor.y + (Merchant.displayHeight - WALK_ENTITY_SPRITE_SIZE_PX) / 2,
  };
}

function travelMs(from: BomberPatrolPoint, to: BomberPatrolPoint, speed: number): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max((dist / speed) * 1000, 1);
}

function randomRangeMs(prng: () => number, minMs: number, maxMs: number): number {
  return minMs + prng() * (maxMs - minMs);
}

/**
 * Loop along the merchant's right side: idle → walk off the top → hidden wait →
 * reappear at top → walk down → idle → repeat.
 */
export function buildBomberPatrolTimeline(
  roomId: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): BomberPatrolTimeline | null {
  const merchant = bomberPatronPoint(roomId, tileSize, worldCols, worldRows);
  if (!merchant) return null;

  const topLane: BomberPatrolPoint = { x: merchant.x, y: BOMBER_REAPPEAR_Y_PX };
  const offScreen: BomberPatrolPoint = { x: merchant.x, y: BOMBER_EXIT_Y_PX };
  const phases: BomberPatrolPhase[] = [];
  const prng = mulberry32(fnv1aHash(roomId, 0x626f_6d62));
  let t = 0;

  const pushIdle = (point: BomberPatrolPoint, durationMs: number): void => {
    phases.push({
      kind: 'idle',
      startMs: t,
      endMs: t + durationMs,
      x: point.x,
      y: point.y,
    });
    t += durationMs;
  };

  const pushMove = (from: BomberPatrolPoint, to: BomberPatrolPoint): void => {
    const dy = to.y - from.y;
    const direction: NpcCardinalDirection = dy >= 0 ? 'down' : 'up';
    const span = travelMs(from, to, BOMBER_PATROL_MOVE_PX_PER_SEC);
    phases.push({
      kind: 'move',
      startMs: t,
      endMs: t + span,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      direction,
    });
    t += span;
  };

  const pushHidden = (point: BomberPatrolPoint, durationMs: number): void => {
    phases.push({
      kind: 'hidden',
      startMs: t,
      endMs: t + durationMs,
      x: point.x,
      y: point.y,
    });
    t += durationMs;
  };

  const appendRoundTrip = (): void => {
    pushMove(merchant, offScreen);
    pushHidden(topLane, randomRangeMs(prng, BOMBER_OFFSCREEN_IDLE_MIN_MS, BOMBER_OFFSCREEN_IDLE_MAX_MS));
    pushMove(topLane, merchant);
  };

  pushIdle(merchant, randomRangeMs(prng, BOMBER_MERCHANT_IDLE_MIN_MS, BOMBER_MERCHANT_IDLE_MAX_MS));
  appendRoundTrip();
  pushIdle(merchant, randomRangeMs(prng, BOMBER_MERCHANT_IDLE_MIN_MS, BOMBER_MERCHANT_IDLE_MAX_MS));
  appendRoundTrip();

  return { phases, cycleMs: t, merchant, topLane };
}

export function sampleBomberPatrolPhase(
  phases: BomberPatrolPhase[],
  phaseMs: number,
): {
  x: number;
  y: number;
  direction: NpcCardinalDirection;
  moving: boolean;
  idle: boolean;
  visible: boolean;
} {
  if (phases.length === 0) {
    return { x: 0, y: 0, direction: 'down', moving: false, idle: true, visible: true };
  }

  let idx = 0;
  while (idx + 1 < phases.length && phaseMs >= phases[idx + 1].startMs) idx += 1;
  while (idx > 0 && phaseMs < phases[idx].startMs) idx -= 1;

  const phase = phases[idx];

  if (phase.kind === 'hidden') {
    return {
      x: phase.x,
      y: phase.y,
      direction: 'down',
      moving: false,
      idle: false,
      visible: false,
    };
  }

  if (phase.kind === 'idle') {
    return {
      x: phase.x,
      y: phase.y,
      direction: 'left',
      moving: false,
      idle: true,
      visible: true,
    };
  }

  const moving = phaseMs >= phase.startMs && phaseMs < phase.endMs;
  if (moving) {
    const span = Math.max(phase.endMs - phase.startMs, 1);
    const u = clamp01((phaseMs - phase.startMs) / span);
    return {
      x: phase.fromX + (phase.toX - phase.fromX) * u,
      y: phase.fromY + (phase.toY - phase.fromY) * u,
      direction: phase.direction,
      moving: true,
      idle: false,
      visible: true,
    };
  }

  if (phaseMs < phase.startMs) {
    return {
      x: phase.fromX,
      y: phase.fromY,
      direction: phase.direction,
      moving: false,
      idle: false,
      visible: true,
    };
  }

  return {
    x: phase.toX,
    y: phase.toY,
    direction: phase.direction,
    moving: false,
    idle: false,
    visible: true,
  };
}
