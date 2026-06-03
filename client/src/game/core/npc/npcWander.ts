import {
  axisLegIntersectsMerchantKeepOut,
  merchantKeepOutRect,
  nudgeAwayFromMerchantKeepOut,
  type MerchantKeepOutRect,
} from '../../config/chatNpc.ts';
import { clampWorldTopLeft } from '../worldMath.ts';

export const NPC_WANDER_PAUSE_MIN_MS = 1500;
export const NPC_WANDER_PAUSE_MAX_MS = 4200;
export const NPC_WANDER_RADIUS_PX = 192;
export const NPC_WANDER_TOUR_LEG_COUNT = 120;
export const NPC_WANDER_TARGET_MAX_ATTEMPTS = 5;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function fnv1aHash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    const x = v | 0;
    h = Math.imul(h ^ (x & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 24) & 0xff), 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveNpcHomeAwayFromMerchant(
  homeX: number,
  homeY: number,
  roomId: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): { x: number; y: number } {
  const keepOut = merchantKeepOutRect(roomId, tileSize, worldCols, worldRows);
  if (!keepOut) {
    return clampWorldTopLeft(homeX, homeY, tileSize, worldCols, worldRows);
  }
  const nudged = nudgeAwayFromMerchantKeepOut(homeX, homeY, keepOut);
  return clampWorldTopLeft(nudged.x, nudged.y, tileSize, worldCols, worldRows);
}

export function isNpcAxisLegAllowed(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  keepOut: MerchantKeepOutRect | null,
): boolean {
  if (!keepOut) return true;
  return !axisLegIntersectsMerchantKeepOut(fromX, fromY, toX, toY, keepOut);
}

export function npcWanderTargetAt(
  cx: number,
  cy: number,
  homeX: number,
  homeY: number,
  horizontal: boolean,
  axisOffset: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): { x: number; y: number } {
  const homeAxis = horizontal ? homeX : homeY;
  const newAxisPos = homeAxis + axisOffset;
  const rawX = horizontal ? newAxisPos : cx;
  const rawY = horizontal ? cy : newAxisPos;
  return clampWorldTopLeft(rawX, rawY, tileSize, worldCols, worldRows);
}

export function pickNpcWanderTarget(
  prng: () => number,
  cx: number,
  cy: number,
  homeX: number,
  homeY: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
  keepOut: MerchantKeepOutRect | null,
): { x: number; y: number } | null {
  let lastHorizontal = prng() < 0.5;
  let lastOffset = (prng() * 2 - 1) * NPC_WANDER_RADIUS_PX;

  const tryTarget = (horizontal: boolean, axisOffset: number): { x: number; y: number } | null => {
    const target = npcWanderTargetAt(cx, cy, homeX, homeY, horizontal, axisOffset, tileSize, worldCols, worldRows);
    return isNpcAxisLegAllowed(cx, cy, target.x, target.y, keepOut) ? target : null;
  };

  for (let attempt = 0; attempt < NPC_WANDER_TARGET_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      lastHorizontal = prng() < 0.5;
      lastOffset = (prng() * 2 - 1) * NPC_WANDER_RADIUS_PX;
    }
    const target = tryTarget(lastHorizontal, lastOffset);
    if (target) return target;
  }

  return tryTarget(lastHorizontal, -lastOffset);
}

export function appendNpcReturnHomeLegs(
  prng: () => number,
  keepOut: MerchantKeepOutRect | null,
  homeX: number,
  homeY: number,
  cx: number,
  cy: number,
  pushLeg: (toX: number, toY: number, pauseMs: number) => void,
): void {
  if (Math.abs(cx - homeX) > 1e-3) {
    const returnX = keepOut ? nudgeAwayFromMerchantKeepOut(homeX, cy, keepOut).x : homeX;
    pushLeg(returnX, cy, NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS));
  }
  if (Math.abs(cy - homeY) > 1e-3) {
    const returnY = keepOut ? nudgeAwayFromMerchantKeepOut(cx, homeY, keepOut).y : homeY;
    pushLeg(cx, returnY, NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS));
  }
}

export function scatterNpcHomesInWorld(
  tileSize: number,
  worldCols: number,
  worldRows: number,
  count: number,
  seedBase: number,
): { x: number; y: number }[] {
  const worldW = worldCols * tileSize;
  const worldH = worldRows * tileSize;
  const marginX = worldW * 0.1;
  const marginY = worldH * 0.1;
  const spanX = worldW - marginX * 2;
  const spanY = worldH - marginY * 2;
  const homes: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    const prng = mulberry32(fnv1aHash(seedBase, i));
    const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
    homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
  }

  return homes;
}
