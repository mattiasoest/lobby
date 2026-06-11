import type { Texture } from 'pixi.js';
import { merchantKeepOutRect } from '../../config/chatNpc.ts';
import { Entity } from '../Entity.ts';
import {
  hasNpcIdleTextures,
  selectNpcDirectionFrames,
  type NpcCardinalDirection,
} from '../../core/npc/npcDirectionFrames.ts';
import type { HopTextureSet } from './HopEntity.ts';
import {
  appendNpcReturnHomeLegs,
  clamp01,
  fnv1aHash,
  isNpcAxisLegAllowed,
  mulberry32,
  NPC_WANDER_PAUSE_MAX_MS,
  NPC_WANDER_PAUSE_MIN_MS,
  NPC_WANDER_TOUR_LEG_COUNT,
  pickNpcWanderTarget,
  resolveNpcHomeAwayFromMerchant,
} from '../../core/npc/npcWander.ts';

export type NpcType =
  | 'bomber'
  | 'bull'
  | 'cow'
  | 'deer'
  | 'frogBlue'
  | 'highlandBull'
  | 'penguin'
  | 'penguinMini'
  | 'slime';
export type WalkDirection = NpcCardinalDirection;

export type WalkTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
  runLeft?: Texture[];
  runDown?: Texture[];
  runUp?: Texture[];
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

/**
 * Decorative wandering NPC with walk-based movement. Position, direction, and walk frame are pure functions of
 * synchronized server time and a per-entity seed.
 */
export abstract class WalkEntity extends Entity {
  static readonly DEER_COUNT = 3;

  static readonly TYPE_SEED_SALT: Record<NpcType, number> = {
    bomber: 0x626f_6d62,
    bull: 0x6b75_6c00,
    cow: 0x636f_7700,
    deer: 0x6465_6572,
    frogBlue: 0x6672_6f67,
    highlandBull: 0x6869_6768,
    penguin: 0x7065_6e67,
    penguinMini: 0x706d_696e,
    slime: 0x736c_696d,
  };

  protected static get wanderMovePxPerSec(): number {
    return MOVE_PX_PER_SEC;
  }

  static fnv1aHash = fnv1aHash;
  static mulberry32 = mulberry32;

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
    const safeHome = resolveNpcHomeAwayFromMerchant(homeX, homeY, roomId, tileSize, worldCols, worldRows);
    this.x = safeHome.x;
    this.y = safeHome.y;

    this.view.position.set(this.x, this.y);

    const ctor = new.target as typeof WalkEntity;
    const { legs, cycleMs } = WalkEntity.buildTour(
      seedBase,
      roomId,
      tileSize,
      worldCols,
      worldRows,
      safeHome.x,
      safeHome.y,
      ctor.wanderMovePxPerSec,
    );
    this.legs = legs;
    this.cycleMs = cycleMs;

    this.applyFrame(Date.now());
  }

  protected get walkFps(): number {
    return WALK_FPS;
  }

  protected get idleFps(): number | null {
    return null;
  }

  protected get useIdleTextures(): boolean {
    return hasNpcIdleTextures(this.textures);
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
    const useIdle = this.shouldUseIdleTextures();
    const { frames, flipX } = selectNpcDirectionFrames(
      this.direction,
      this.textures,
      useIdle ? 'idle' : 'walk',
      this.horizontalProfileFacesRight,
    );

    const idleRate = this.idleFps;
    const rawIdx = useIdle && idleRate !== null ? Math.floor((roomNowMs / 1000) * idleRate) : this.frameIndex;
    this.setSpriteTexture(frames[this.wrapFrameIndex(rawIdx, frames.length)]);
    this.setSpriteFlipX(flipX);
  }

  private static buildTour(
    seedBase: number,
    roomId: number,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    movePxPerSec: number,
  ): { legs: WalkLeg[]; cycleMs: number } {
    const prng = mulberry32(seedBase);
    const keepOut = merchantKeepOutRect(roomId, tileSize, worldCols, worldRows);
    const legs: WalkLeg[] = [];
    let cx = homeX;
    let cy = homeY;
    let cumMs = 0;

    const pushLeg = (toX: number, toY: number, pauseMs: number): void => {
      if (!isNpcAxisLegAllowed(cx, cy, toX, toY, keepOut)) return;
      cumMs += pauseMs;
      const startMs = cumMs;
      const dx = toX - cx;
      const dy = toY - cy;
      const dist = Math.hypot(dx, dy);
      const travelMs = (dist / movePxPerSec) * 1000;
      const arriveMs = startMs + Math.max(travelMs, 1);

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const direction: WalkDirection = ax >= ay ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';

      legs.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX, toY, direction });
      cumMs = arriveMs;
      cx = toX;
      cy = toY;
    };

    for (let i = 0; i < NPC_WANDER_TOUR_LEG_COUNT; i++) {
      const pauseMs = NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS);
      const target = pickNpcWanderTarget(prng, cx, cy, homeX, homeY, tileSize, worldCols, worldRows, keepOut);
      if (target) pushLeg(target.x, target.y, pauseMs);
    }

    appendNpcReturnHomeLegs(prng, keepOut, homeX, homeY, cx, cy, pushLeg);
    cumMs += NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS);

    return { legs, cycleMs: cumMs };
  }
}
