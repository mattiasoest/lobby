import type { Texture } from 'pixi.js';
import { merchantKeepOutRect } from '../../config/chatNpc.ts';
import { Entity } from '../Entity.ts';
import {
  hasNpcIdleTextures,
  selectNpcDirectionFrames,
  type NpcCardinalDirection,
} from '../../core/npc/npcDirectionFrames.ts';
import type { NpcType } from './WalkEntity.ts';
import {
  appendNpcReturnHomeLegs,
  clamp01,
  isNpcAxisLegAllowed,
  mulberry32,
  NPC_WANDER_PAUSE_MAX_MS,
  NPC_WANDER_PAUSE_MIN_MS,
  NPC_WANDER_TOUR_LEG_COUNT,
  pickNpcWanderTarget,
  resolveNpcHomeAwayFromMerchant,
} from '../../core/npc/npcWander.ts';

export type HopDirection = NpcCardinalDirection;

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
    const safeHome = resolveNpcHomeAwayFromMerchant(homeX, homeY, roomId, tileSize, worldCols, worldRows);
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
    return hasNpcIdleTextures(this.textures);
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
    const useIdle = !this.inHopAnim && this.useIdleTextures;
    const { frames, flipX } = selectNpcDirectionFrames(
      this.direction,
      this.textures,
      useIdle ? 'idle' : 'walk',
      this.config.horizontalProfileFacesRight,
    );

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
    const prng = mulberry32(seedBase);
    const keepOut = merchantKeepOutRect(roomId, tileSize, worldCols, worldRows);
    const hops: HopLeg[] = [];
    let cx = homeX;
    let cy = homeY;
    let cumMs = 0;
    const hopDurationMs = (jumpFrameCount / hopFps) * 1000;

    const pushHopChain = (toX: number, toY: number, pauseMs: number): void => {
      if (!isNpcAxisLegAllowed(cx, cy, toX, toY, keepOut)) return;
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

        if (!isNpcAxisLegAllowed(cx, cy, hopToX, hopToY, keepOut)) break;

        const startMs = cumMs;
        const arriveMs = startMs + hopDurationMs;
        hops.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX: hopToX, toY: hopToY, direction });
        cumMs = arriveMs;
        cx = hopToX;
        cy = hopToY;
      }
    };

    for (let i = 0; i < NPC_WANDER_TOUR_LEG_COUNT; i++) {
      const pauseMs = NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS);
      const target = pickNpcWanderTarget(prng, cx, cy, homeX, homeY, tileSize, worldCols, worldRows, keepOut);
      if (target) pushHopChain(target.x, target.y, pauseMs);
    }

    appendNpcReturnHomeLegs(prng, keepOut, homeX, homeY, cx, cy, pushHopChain);
    cumMs += NPC_WANDER_PAUSE_MIN_MS + prng() * (NPC_WANDER_PAUSE_MAX_MS - NPC_WANDER_PAUSE_MIN_MS);

    return { hops, cycleMs: cumMs };
  }
}
