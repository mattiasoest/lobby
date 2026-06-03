import type { Texture } from 'pixi.js';
import {
  axisLegIntersectsMerchantKeepOut,
  merchantKeepOutRect,
  nudgeAwayFromMerchantKeepOut,
  type MerchantKeepOutRect,
} from '../../config/chatNpc.ts';
import { clampWorldTopLeft } from '../../core/worldMath.ts';
import { Entity } from '../Entity.ts';
import type { NpcType } from './WalkEntity.ts';

export type HopDirection = 'left' | 'right' | 'down' | 'up';

export type HopTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
};

export type HopEntityConfig = {
  hopFps: number;
  idleFps: number | null;
  jumpFrameCount: number;
  moveFrameCount: number;
  moveStartFrame: number;
  hopDistancePx: number;
  horizontalProfileFacesRight: boolean;
  spriteFrameSizePx: number;
};

type HopLeg = {
  startMs: number;
  arriveMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  direction: HopDirection;
};

const PAUSE_MIN_MS = 1500;
const PAUSE_MAX_MS = 4200;
const WANDER_RADIUS_PX = 192;
const TOUR_LEG_COUNT = 120;
const WANDER_TARGET_MAX_ATTEMPTS = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Decorative hopper driven by synchronized server time and a per-entity seed.
 * Position advances only during configured jump frames; landing frames hold still.
 */
export abstract class HopEntity extends Entity {
  abstract readonly type: NpcType;

  protected readonly textures: HopTextureSet;
  private readonly config: HopEntityConfig;
  private readonly hops: HopLeg[];
  private readonly cycleMs: number;
  private cachedHopIdx = 0;

  private x: number;
  private y: number;
  private direction: HopDirection = 'down';
  private frameIndex = 0;
  private inHopAnim = false;

  protected constructor(
    textures: HopTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    roomId: number,
    config: HopEntityConfig,
  ) {
    const { pad, innerSize } = Entity.layoutForTileSize(tileSize);
    super(tileSize, textures.down[0], innerSize / 2 - pad, innerSize / 2 - pad);
    this.config = config;
    this.applySpriteDisplaySize(config.spriteFrameSizePx);
    this.textures = textures;
    const safeHome = HopEntity.resolveHomeAwayFromMerchant(homeX, homeY, roomId, tileSize, worldCols, worldRows);
    this.x = safeHome.x;
    this.y = safeHome.y;
    this.view.position.set(this.x, this.y);

    const { hops, cycleMs } = HopEntity.buildHopTour(
      seedBase,
      roomId,
      tileSize,
      worldCols,
      worldRows,
      safeHome.x,
      safeHome.y,
      config.hopDistancePx,
      config.jumpFrameCount,
      config.hopFps,
    );
    this.hops = hops;
    this.cycleMs = cycleMs;

    this.applyFrame(Date.now());
  }

  protected get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }

  update(roomNowMs: number): void {
    const phaseMs = roomNowMs % this.cycleMs;
    const hops = this.hops;

    let idx = this.cachedHopIdx;
    if (idx < 0 || idx >= hops.length) idx = 0;
    while (idx + 1 < hops.length && phaseMs >= hops[idx + 1].startMs) idx += 1;
    while (idx > 0 && phaseMs < hops[idx].startMs) idx -= 1;
    this.cachedHopIdx = idx;

    const hop = hops[idx];
    if (!hop) {
      this.inHopAnim = false;
      this.view.position.set(this.x, this.y);
      this.applyFrame(roomNowMs);
      return;
    }

    const inHop = phaseMs >= hop.startMs && phaseMs < hop.arriveMs;

    if (inHop) {
      this.inHopAnim = true;
      const elapsedMs = phaseMs - hop.startMs;
      const frameIdx = Math.min(Math.floor((elapsedMs / 1000) * this.config.hopFps), this.config.jumpFrameCount - 1);
      this.frameIndex = frameIdx;
      this.direction = hop.direction;

      if (frameIdx < this.config.moveStartFrame) {
        this.x = hop.fromX;
        this.y = hop.fromY;
      } else if (frameIdx < this.config.moveFrameCount) {
        const moveFrames = this.config.moveFrameCount - this.config.moveStartFrame;
        const moveFrameIdx = frameIdx - this.config.moveStartFrame;
        const t = clamp01(moveFrameIdx / (moveFrames - 1));
        this.x = hop.fromX + (hop.toX - hop.fromX) * t;
        this.y = hop.fromY + (hop.toY - hop.fromY) * t;
      } else {
        this.x = hop.toX;
        this.y = hop.toY;
      }
    } else if (phaseMs < hop.startMs) {
      this.inHopAnim = false;
      this.x = hop.fromX;
      this.y = hop.fromY;
      this.direction = hop.direction;
      this.frameIndex = 0;
    } else {
      this.inHopAnim = false;
      this.x = hop.toX;
      this.y = hop.toY;
      this.direction = hop.direction;
      this.frameIndex = 0;
    }

    this.view.position.set(this.x, this.y);
    this.applyFrame(roomNowMs);
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  private applyFrame(roomNowMs: number): void {
    const tex = this.textures;
    const useIdle = !this.inHopAnim && this.useIdleTextures;

    let frames: Texture[];
    let flipX = false;
    const profileFacesRight = this.config.horizontalProfileFacesRight;
    switch (this.direction) {
      case 'right':
        frames = useIdle && tex.idleLeft ? tex.idleLeft : tex.left;
        flipX = !profileFacesRight;
        break;
      case 'left':
        frames = useIdle && tex.idleLeft ? tex.idleLeft : tex.left;
        flipX = profileFacesRight;
        break;
      case 'up':
        frames = useIdle && tex.idleUp ? tex.idleUp : tex.up;
        break;
      case 'down':
      default:
        frames = useIdle && tex.idleDown ? tex.idleDown : tex.down;
        break;
    }

    const idleRate = this.config.idleFps;
    const rawIdx = useIdle && idleRate !== null ? Math.floor((roomNowMs / 1000) * idleRate) : this.frameIndex;
    this.setSpriteTexture(frames[this.wrapFrameIndex(rawIdx, frames.length)]);
    this.setSpriteFlipX(flipX);
  }

  private static buildHopTour(
    seedBase: number,
    roomId: number,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    hopDistancePx: number,
    jumpFrameCount: number,
    hopFps: number,
  ): { hops: HopLeg[]; cycleMs: number } {
    const prng = HopEntity.mulberry32(seedBase);
    const keepOut = merchantKeepOutRect(roomId, tileSize, worldCols, worldRows);
    const hops: HopLeg[] = [];
    let cx = homeX;
    let cy = homeY;
    let cumMs = 0;
    const hopDurationMs = (jumpFrameCount / hopFps) * 1000;

    const pushHopChain = (toX: number, toY: number, pauseMs: number): void => {
      if (!HopEntity.isHopAllowed(cx, cy, toX, toY, keepOut)) return;
      cumMs += pauseMs;

      const targetX = toX;
      const targetY = toY;

      while (Math.abs(cx - targetX) > 1e-3 || Math.abs(cy - targetY) > 1e-3) {
        const dx = targetX - cx;
        const dy = targetY - cy;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);

        let hopToX = cx;
        let hopToY = cy;
        let direction: HopDirection;

        if (ax >= ay) {
          const step = Math.min(hopDistancePx, ax) * (dx >= 0 ? 1 : -1);
          hopToX = cx + step;
          direction = dx >= 0 ? 'right' : 'left';
        } else {
          const step = Math.min(hopDistancePx, ay) * (dy >= 0 ? 1 : -1);
          hopToY = cy + step;
          direction = dy >= 0 ? 'down' : 'up';
        }

        if (!HopEntity.isHopAllowed(cx, cy, hopToX, hopToY, keepOut)) break;

        const startMs = cumMs;
        const arriveMs = startMs + hopDurationMs;
        hops.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX: hopToX, toY: hopToY, direction });
        cumMs = arriveMs;
        cx = hopToX;
        cy = hopToY;
      }
    };

    for (let i = 0; i < TOUR_LEG_COUNT; i++) {
      const pauseMs = PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      const target = HopEntity.pickWanderTarget(prng, cx, cy, homeX, homeY, tileSize, worldCols, worldRows, keepOut);
      if (target) pushHopChain(target.x, target.y, pauseMs);
    }

    if (Math.abs(cx - homeX) > 1e-3) {
      const returnX = keepOut ? nudgeAwayFromMerchantKeepOut(homeX, cy, keepOut).x : homeX;
      pushHopChain(returnX, cy, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }
    if (Math.abs(cy - homeY) > 1e-3) {
      const returnY = keepOut ? nudgeAwayFromMerchantKeepOut(cx, homeY, keepOut).y : homeY;
      pushHopChain(cx, returnY, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }

    cumMs += PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);

    return { hops, cycleMs: cumMs };
  }

  private static resolveHomeAwayFromMerchant(
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

  private static isHopAllowed(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    keepOut: MerchantKeepOutRect | null,
  ): boolean {
    if (!keepOut) return true;
    return !axisLegIntersectsMerchantKeepOut(fromX, fromY, toX, toY, keepOut);
  }

  private static wanderTargetAt(
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

  private static pickWanderTarget(
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
    let lastOffset = (prng() * 2 - 1) * WANDER_RADIUS_PX;

    const tryTarget = (horizontal: boolean, axisOffset: number): { x: number; y: number } | null => {
      const target = HopEntity.wanderTargetAt(
        cx,
        cy,
        homeX,
        homeY,
        horizontal,
        axisOffset,
        tileSize,
        worldCols,
        worldRows,
      );
      return HopEntity.isHopAllowed(cx, cy, target.x, target.y, keepOut) ? target : null;
    };

    for (let attempt = 0; attempt < WANDER_TARGET_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        lastHorizontal = prng() < 0.5;
        lastOffset = (prng() * 2 - 1) * WANDER_RADIUS_PX;
      }
      const target = tryTarget(lastHorizontal, lastOffset);
      if (target) return target;
    }

    return tryTarget(lastHorizontal, -lastOffset);
  }

  static mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
