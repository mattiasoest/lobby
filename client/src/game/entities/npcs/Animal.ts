import { Assets, type Texture } from 'pixi.js';
import { clampWorldTopLeft } from '../../core/worldMath.ts';
import { Entity } from '../Entity.ts';

export type AnimalKind = 'bull' | 'cow' | 'deer' | 'penguin';
export type AnimalDirection = 'left' | 'right' | 'down' | 'up';

export type AnimalTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
};

export type AnimalTextureMap = {
  bull: AnimalTextureSet;
  cow: AnimalTextureSet;
  deer: AnimalTextureSet;
  penguin: AnimalTextureSet | null;
};

type AnimalLeg = {
  startMs: number;
  arriveMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  direction: AnimalDirection;
};

const FRAME_SIZE = 32;
/** Native spritesheet frame size; rendered 1:1 in world px (not upscaled to tile size). */
export const ANIMAL_SPRITE_SIZE_PX = FRAME_SIZE;
export const PENGUIN_SPRITE_SIZE_PX = 16;
const PENGUIN_FRAME_SIZE = PENGUIN_SPRITE_SIZE_PX;
const FRAMES_PER_ROW = 4;
const PENGUIN_ROW_DOWN = 0;
const PENGUIN_ROW_RIGHT = 1;
const PENGUIN_ROW_UP = 2;
/** Trim bleed from adjacent rows (sprites sit low/high within 16px cells). */
const PENGUIN_ROW_INSET = {
  down: { left: 2 },
  right: { top: 1 },
  up: { top: 1, left: 1 },
} as const;
const DEER_IDLE_FRAMES_PER_ROW = 2;
const WALK_FPS = 6;
const MOVE_PX_PER_SEC = 26;
const SHEET_ROW_LEFT = 0;
const SHEET_ROW_DOWN = 1;
const SHEET_ROW_UP = 2;
/** Bull/cow down/up rows sit high in their cells; trim bleed from the row above. */
const BULL_COW_ROW_INSET = {
  down: { top: 1 },
  up: { top: 1 },
} as const;
const PAUSE_MIN_MS = 1500;
const PAUSE_MAX_MS = 4200;
const WANDER_RADIUS_PX = 192;
const TOUR_LEG_COUNT = 120;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Decorative wandering animal. Position, direction, and walk frame are pure functions of
 * synchronized server time and a per-animal seed.
 */
export abstract class Animal extends Entity {
  static readonly DEER_COUNT = 3;

  static readonly KIND_SEED_SALT: Record<AnimalKind, number> = {
    bull: 0x6b75_6c00,
    cow: 0x636f_7700,
    deer: 0x6465_6572,
    penguin: 0x7065_6e67,
  };

  abstract readonly kind: AnimalKind;

  protected readonly textures: AnimalTextureSet;

  private readonly legs: AnimalLeg[];
  private readonly cycleMs: number;
  private cachedLegIdx = 0;

  private x: number;
  private y: number;
  private direction: AnimalDirection = 'down';
  private frameIndex = 0;
  private isMoving = false;

  protected constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    spriteFrameSizePx: number,
  ) {
    const { pad, innerSize } = Entity.layoutForTileSize(tileSize);
    super(tileSize, textures.down[0], innerSize / 2 - pad, innerSize / 2 - pad);
    this.applySpriteDisplaySize(spriteFrameSizePx);
    this.textures = textures;
    this.x = homeX;
    this.y = homeY;

    this.view.position.set(this.x, this.y);

    const { legs, cycleMs } = Animal.buildTour(seedBase, tileSize, worldCols, worldRows, homeX, homeY);
    this.legs = legs;
    this.cycleMs = cycleMs;

    this.applyFrame(Date.now());
  }

  /** Load bull, cow, deer, and penguin spritesheets in parallel. Returns `null` if core sheets fail. */
  static async loadTextures(
    bullSrc: string,
    cowSrc: string,
    deerSrc: { idle: string; walk: string },
    penguinSrc: string,
  ): Promise<AnimalTextureMap | null> {
    const [bull, cow, deer, penguin] = await Promise.all([
      Animal.loadOneSheet(bullSrc, BULL_COW_ROW_INSET),
      Animal.loadOneSheet(cowSrc, BULL_COW_ROW_INSET),
      Animal.loadDeerSheet(deerSrc.idle, deerSrc.walk),
      Animal.loadPenguinSheet(penguinSrc),
    ]);
    if (!bull || !cow || !deer) return null;
    return { bull, cow, deer, penguin };
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
      this.frameIndex = Math.floor((roomNowMs / 1000) * this.walkFps);
    } else if (phaseMs < leg.startMs) {
      this.x = leg.fromX;
      this.y = leg.fromY;
      this.direction = leg.direction;
      this.isMoving = false;
      this.frameIndex = 0;
    } else {
      this.x = leg.toX;
      this.y = leg.toY;
      this.direction = leg.direction;
      this.isMoving = false;
      this.frameIndex = 0;
    }

    this.view.position.set(this.x, this.y);
    this.applyFrame(roomNowMs);
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  protected applyFrame(roomNowMs: number): void {
    const tex = this.textures;
    const useIdle = !this.isMoving && this.useIdleTextures;

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

  private static async loadPenguinSheet(src: string): Promise<AnimalTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        down: Entity.sliceSpritesheetRow(base, PENGUIN_ROW_DOWN, FRAMES_PER_ROW, PENGUIN_FRAME_SIZE),
        left: Entity.sliceSpritesheetRow(
          base,
          PENGUIN_ROW_RIGHT,
          FRAMES_PER_ROW,
          PENGUIN_FRAME_SIZE,
          PENGUIN_ROW_INSET.right,
        ),
        up: Entity.sliceSpritesheetRow(base, PENGUIN_ROW_UP, FRAMES_PER_ROW, PENGUIN_FRAME_SIZE, PENGUIN_ROW_INSET.up),
      };
    } catch {
      return null;
    }
  }

  private static async loadOneSheet(
    src: string,
    rowInset?: {
      left?: { top?: number; right?: number; bottom?: number; left?: number };
      down?: { top?: number; right?: number; bottom?: number; left?: number };
      up?: { top?: number; right?: number; bottom?: number; left?: number };
    },
  ): Promise<AnimalTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        left: Entity.sliceSpritesheetRow(base, SHEET_ROW_LEFT, FRAMES_PER_ROW, FRAME_SIZE, rowInset?.left),
        down: Entity.sliceSpritesheetRow(base, SHEET_ROW_DOWN, FRAMES_PER_ROW, FRAME_SIZE, rowInset?.down),
        up: Entity.sliceSpritesheetRow(base, SHEET_ROW_UP, FRAMES_PER_ROW, FRAME_SIZE, rowInset?.up),
      };
    } catch {
      return null;
    }
  }

  private static async loadDeerSheet(idleSrc: string, walkSrc: string): Promise<AnimalTextureSet | null> {
    try {
      const [idleBase, walkBase] = await Promise.all([Assets.load<Texture>(idleSrc), Assets.load<Texture>(walkSrc)]);
      idleBase.source.scaleMode = 'nearest';
      walkBase.source.scaleMode = 'nearest';
      return {
        left: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_LEFT, FRAMES_PER_ROW, FRAME_SIZE),
        down: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_DOWN, FRAMES_PER_ROW, FRAME_SIZE),
        up: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_UP, FRAMES_PER_ROW, FRAME_SIZE),
        idleLeft: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_LEFT, DEER_IDLE_FRAMES_PER_ROW, FRAME_SIZE),
        idleDown: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_DOWN, DEER_IDLE_FRAMES_PER_ROW, FRAME_SIZE),
        idleUp: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_UP, DEER_IDLE_FRAMES_PER_ROW, FRAME_SIZE),
      };
    } catch {
      return null;
    }
  }

  private static buildTour(
    seedBase: number,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
  ): { legs: AnimalLeg[]; cycleMs: number } {
    const prng = Animal.mulberry32(seedBase);
    const legs: AnimalLeg[] = [];
    let cx = homeX;
    let cy = homeY;
    let cumMs = 0;

    const pushLeg = (toX: number, toY: number, pauseMs: number): void => {
      cumMs += pauseMs;
      const startMs = cumMs;
      const dx = toX - cx;
      const dy = toY - cy;
      const dist = Math.hypot(dx, dy);
      const travelMs = (dist / MOVE_PX_PER_SEC) * 1000;
      const arriveMs = startMs + Math.max(travelMs, 1);

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const direction: AnimalDirection = ax >= ay ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';

      legs.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX, toY, direction });
      cumMs = arriveMs;
      cx = toX;
      cy = toY;
    };

    for (let i = 0; i < TOUR_LEG_COUNT; i++) {
      const pauseMs = PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      const horizontal = prng() < 0.5;
      const homeAxis = horizontal ? homeX : homeY;
      const newAxisPos = homeAxis + (prng() * 2 - 1) * WANDER_RADIUS_PX;
      const rawX = horizontal ? newAxisPos : cx;
      const rawY = horizontal ? cy : newAxisPos;
      const clamped = clampWorldTopLeft(rawX, rawY, tileSize, worldCols, worldRows);
      pushLeg(clamped.x, clamped.y, pauseMs);
    }

    if (Math.abs(cx - homeX) > 1e-3) {
      pushLeg(homeX, cy, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }
    if (Math.abs(cy - homeY) > 1e-3) {
      pushLeg(cx, homeY, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
    }

    cumMs += PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);

    return { legs, cycleMs: cumMs };
  }
}
