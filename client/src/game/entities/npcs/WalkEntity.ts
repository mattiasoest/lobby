import type { Texture } from 'pixi.js';
import {
  axisLegIntersectsMerchantKeepOut,
  merchantKeepOutRect,
  nudgeAwayFromMerchantKeepOut,
  type MerchantKeepOutRect,
} from '../../config/chatNpc.ts';
import { clampWorldTopLeft } from '../../core/worldMath.ts';
import { Entity } from '../Entity.ts';
import type { HopTextureSet } from './HopEntity.ts';

export type NpcType = 'bull' | 'cow' | 'deer' | 'frogBlue' | 'highlandBull' | 'penguin' | 'slime';
export type WalkDirection = 'left' | 'right' | 'down' | 'up';

export type WalkTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
};

export type NpcTextureSet = WalkTextureSet | HopTextureSet;
export type LoadedNpcTextures = Partial<Record<NpcType, NpcTextureSet>>;

type WalkLeg = {
  startMs: number;
  arriveMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  direction: WalkDirection;
};

/** Native spritesheet frame size; rendered 1:1 in world px (not upscaled to tile size). */
export const WALK_ENTITY_SPRITE_SIZE_PX = 32;
const WALK_FPS = 6;
const MOVE_PX_PER_SEC = 26;
const PAUSE_MIN_MS = 1500;
const PAUSE_MAX_MS = 4200;
const WANDER_RADIUS_PX = 192;
const TOUR_LEG_COUNT = 120;
const WANDER_TARGET_MAX_ATTEMPTS = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Decorative wandering NPC with walk-based movement. Position, direction, and walk frame are pure functions of
 * synchronized server time and a per-entity seed.
 */
export abstract class WalkEntity extends Entity {
  static readonly DEER_COUNT = 3;

  static readonly TYPE_SEED_SALT: Record<NpcType, number> = {
    bull: 0x6b75_6c00,
    cow: 0x636f_7700,
    deer: 0x6465_6572,
    frogBlue: 0x6672_6f67,
    highlandBull: 0x6869_6768,
    penguin: 0x7065_6e67,
    slime: 0x736c_696d,
  };

  abstract readonly type: NpcType;

  protected readonly textures: WalkTextureSet;

  private readonly legs: WalkLeg[];
  private readonly cycleMs: number;
  private cachedLegIdx = 0;

  private x: number;
  private y: number;
  private direction: WalkDirection = 'down';
  protected frameIndex = 0;
  protected isMoving = false;

  protected constructor(
    textures: WalkTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    spriteFrameSizePx: number,
    roomId: number,
  ) {
    const { pad, innerSize } = Entity.layoutForTileSize(tileSize);
    super(tileSize, textures.down[0], innerSize / 2 - pad, innerSize / 2 - pad);
    this.applySpriteDisplaySize(spriteFrameSizePx);
    this.textures = textures;
    const safeHome = WalkEntity.resolveHomeAwayFromMerchant(homeX, homeY, roomId, tileSize, worldCols, worldRows);
    this.x = safeHome.x;
    this.y = safeHome.y;

    this.view.position.set(this.x, this.y);

    const { legs, cycleMs } = WalkEntity.buildTour(
      seedBase,
      roomId,
      tileSize,
      worldCols,
      worldRows,
      safeHome.x,
      safeHome.y,
    );
    this.legs = legs;
    this.cycleMs = cycleMs;

    this.applyFrame(Date.now());
  }

  static fnv1aHash(...values: number[]): number {
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

  protected get walkFps(): number {
    return WALK_FPS;
  }

  protected get idleFps(): number | null {
    return null;
  }

  protected get useIdleTextures(): boolean {
    return false;
  }

  /** Horizontal sprites face left by default; flip when moving right. Override when the sheet faces right. */
  protected get horizontalProfileFacesRight(): boolean {
    return false;
  }

  protected shouldUseIdleTextures(): boolean {
    return !this.isMoving && this.useIdleTextures;
  }

  protected computeWalkFrameIndex(roomNowMs: number, moving: boolean): number {
    if (!moving) return 0;
    return Math.floor((roomNowMs / 1000) * this.walkFps);
  }

  update(roomNowMs: number): void {
    const phaseMs = roomNowMs % this.cycleMs;
    const legs = this.legs;

    let idx = this.cachedLegIdx;
    if (idx < 0 || idx >= legs.length) idx = 0;
    while (idx + 1 < legs.length && phaseMs >= legs[idx + 1].startMs) idx += 1;
    while (idx > 0 && phaseMs < legs[idx].startMs) idx -= 1;
    this.cachedLegIdx = idx;

    const leg = legs[idx];
    const moving = phaseMs >= leg.startMs && phaseMs < leg.arriveMs;

    if (moving) {
      const legSpan = Math.max(leg.arriveMs - leg.startMs, 1);
      const t = clamp01((phaseMs - leg.startMs) / legSpan);
      this.x = leg.fromX + (leg.toX - leg.fromX) * t;
      this.y = leg.fromY + (leg.toY - leg.fromY) * t;
      this.direction = leg.direction;
      this.isMoving = true;
    } else if (phaseMs < leg.startMs) {
      this.x = leg.fromX;
      this.y = leg.fromY;
      this.direction = leg.direction;
      this.isMoving = false;
    } else {
      this.x = leg.toX;
      this.y = leg.toY;
      this.direction = leg.direction;
      this.isMoving = false;
    }

    this.frameIndex = this.computeWalkFrameIndex(roomNowMs, this.isMoving);
    this.view.position.set(this.x, this.y);
    this.applyFrame(roomNowMs);
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  protected applyFrame(roomNowMs: number): void {
    const tex = this.textures;
    const useIdle = this.shouldUseIdleTextures();

    let frames: Texture[];
    let flipX = false;
    const profileFacesRight = this.horizontalProfileFacesRight;
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

    const idleRate = this.idleFps;
    const rawIdx = useIdle && idleRate !== null ? Math.floor((roomNowMs / 1000) * idleRate) : this.frameIndex;
    this.setSpriteTexture(frames[this.wrapFrameIndex(rawIdx, frames.length)]);
    this.setSpriteFlipX(flipX);
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

  private static isWanderLegAllowed(
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
      const target = WalkEntity.wanderTargetAt(
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
      return WalkEntity.isWanderLegAllowed(cx, cy, target.x, target.y, keepOut) ? target : null;
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

  private static buildTour(
    seedBase: number,
    roomId: number,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
  ): { legs: WalkLeg[]; cycleMs: number } {
    const prng = WalkEntity.mulberry32(seedBase);
    const keepOut = merchantKeepOutRect(roomId, tileSize, worldCols, worldRows);
    const legs: WalkLeg[] = [];
    let cx = homeX;
    let cy = homeY;
    let cumMs = 0;

    const pushLeg = (toX: number, toY: number, pauseMs: number): void => {
      if (!WalkEntity.isWanderLegAllowed(cx, cy, toX, toY, keepOut)) return;
      cumMs += pauseMs;
      const startMs = cumMs;
      const dx = toX - cx;
      const dy = toY - cy;
      const dist = Math.hypot(dx, dy);
      const travelMs = (dist / MOVE_PX_PER_SEC) * 1000;
      const arriveMs = startMs + Math.max(travelMs, 1);

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const direction: WalkDirection = ax >= ay ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';

      legs.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX, toY, direction });
      cumMs = arriveMs;
      cx = toX;
      cy = toY;
    };

    for (let i = 0; i < TOUR_LEG_COUNT; i++) {
      const pauseMs = PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      const target = WalkEntity.pickWanderTarget(prng, cx, cy, homeX, homeY, tileSize, worldCols, worldRows, keepOut);
      if (target) pushLeg(target.x, target.y, pauseMs);
    }

    if (Math.abs(cx - homeX) > 1e-3) {
      const returnX = keepOut ? nudgeAwayFromMerchantKeepOut(homeX, cy, keepOut).x : homeX;
      pushLeg(returnX, cy, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }
    if (Math.abs(cy - homeY) > 1e-3) {
      const returnY = keepOut ? nudgeAwayFromMerchantKeepOut(cx, homeY, keepOut).y : homeY;
      pushLeg(cx, returnY, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }

    cumMs += PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);

    return { legs, cycleMs: cumMs };
  }
}
