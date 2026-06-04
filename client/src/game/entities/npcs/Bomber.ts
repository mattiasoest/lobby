import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WALK_ENTITY_SPRITE_SIZE_PX, type NpcType, type WalkTextureSet } from './WalkEntity.ts';
import {
  buildBomberPatrolTimeline,
  sampleBomberPatrolPhase,
  type BomberPatrolTimeline,
} from '../../core/npc/bomberPatrol.ts';
import { hasNpcIdleTextures, selectNpcDirectionFrames, type NpcMotionKind } from '../../core/npc/npcDirectionFrames.ts';

const BOMBER_IDLE_FPS = 2;
const BOMBER_WALK_FPS = 6;
const BOMBER_WALK_FRAME_COUNT = 6;

const BOMBER_FRAME_COUNTS = { idle: 4, walk: 6, run: 8 } as const;

/** Bomber sheets: row 0 = down, row 1 = up (back), row 2 = right profile (flip for left). */
const BOMBER_ROW_DOWN = 0;
const BOMBER_ROW_UP = 1;
const BOMBER_ROW_RIGHT = 2;

/**
 * Merchant patron NPC: vertical lane east of the stall up to the top edge.
 * Walks off-screen, waits hidden, returns to idle by the merchant.
 */
export class Bomber extends Entity {
  readonly type: NpcType = 'bomber';

  private readonly textures: WalkTextureSet;
  private readonly patrol: BomberPatrolTimeline;

  private x: number;
  private y: number;
  private direction: 'left' | 'right' | 'down' | 'up' = 'down';
  private frameIndex = 0;
  private isPatronIdle = false;
  private visible = true;

  private finishingWalk = false;
  private walkFinishStartMs = 0;
  private walkFinishFromFrame = 0;
  private wasMoving = false;

  constructor(textures: WalkTextureSet, tileSize: number, worldCols: number, worldRows: number, roomId: number) {
    const patrol = buildBomberPatrolTimeline(roomId, tileSize, worldCols, worldRows);
    if (!patrol) {
      throw new Error(`Bomber patrol timeline unavailable for room ${roomId}`);
    }

    const { pad, innerSize } = Entity.layoutForTileSize(tileSize);
    super(tileSize, textures.idleDown?.[0] ?? textures.down[0], innerSize / 2 - pad, innerSize / 2 - pad);
    this.applySpriteDisplaySize(WALK_ENTITY_SPRITE_SIZE_PX);
    this.textures = textures;
    this.patrol = patrol;
    this.x = patrol.merchant.x;
    this.y = patrol.merchant.y;
    this.view.position.set(this.x, this.y);
    this.view.visible = true;
    this.applyFrame(Date.now());
  }

  update(roomNowMs: number): void {
    const phaseMs = roomNowMs % this.patrol.cycleMs;
    const sample = sampleBomberPatrolPhase(this.patrol.phases, phaseMs);

    this.x = sample.x;
    this.y = sample.y;
    this.direction = sample.direction;
    this.isPatronIdle = sample.idle;
    this.visible = sample.visible;
    this.view.visible = sample.visible;
    this.view.position.set(this.x, this.y);

    this.frameIndex = this.computeWalkFrameIndex(roomNowMs, sample.moving);
    this.applyFrame(roomNowMs);
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  isOnMinimap(): boolean {
    return this.visible;
  }

  protected get horizontalProfileFacesRight(): boolean {
    return true;
  }

  protected get useIdleTextures(): boolean {
    return hasNpcIdleTextures(this.textures);
  }

  protected motionKind(): NpcMotionKind {
    if (this.isPatronIdle && this.useIdleTextures) return 'idle';
    return 'walk';
  }

  protected computeWalkFrameIndex(roomNowMs: number, moving: boolean): number {
    const walkLastFrame = BOMBER_WALK_FRAME_COUNT - 1;

    if (moving) {
      this.finishingWalk = false;
      this.wasMoving = true;
      return Math.floor((roomNowMs / 1000) * BOMBER_WALK_FPS);
    }

    if (this.wasMoving) {
      this.wasMoving = false;
      const atStop = Math.floor((roomNowMs / 1000) * BOMBER_WALK_FPS) % BOMBER_WALK_FRAME_COUNT;
      if (atStop >= walkLastFrame) {
        this.finishingWalk = false;
        return walkLastFrame;
      }
      this.finishingWalk = true;
      this.walkFinishStartMs = roomNowMs;
      this.walkFinishFromFrame = atStop;
      return atStop;
    }

    if (this.finishingWalk) {
      const advanced =
        this.walkFinishFromFrame + Math.floor(((roomNowMs - this.walkFinishStartMs) / 1000) * BOMBER_WALK_FPS);
      if (advanced >= walkLastFrame) {
        this.finishingWalk = false;
        return walkLastFrame;
      }
      return advanced;
    }

    return 0;
  }

  protected applyFrame(roomNowMs: number): void {
    const motion = this.motionKind();
    const { frames, flipX } = selectNpcDirectionFrames(
      this.direction,
      this.textures,
      motion,
      this.horizontalProfileFacesRight,
    );

    const rawIdx = motion === 'idle' ? Math.floor((roomNowMs / 1000) * BOMBER_IDLE_FPS) : this.frameIndex;
    this.setSpriteTexture(frames[this.wrapFrameIndex(rawIdx, frames.length)]);
    this.setSpriteFlipX(flipX);
  }

  private static sliceDirectionalSheet(
    base: Texture,
    frameCount: number,
  ): Pick<WalkTextureSet, 'left' | 'down' | 'up'> {
    const size = WALK_ENTITY_SPRITE_SIZE_PX;
    return {
      down: Entity.sliceSpritesheetRow(base, BOMBER_ROW_DOWN, frameCount, size),
      up: Entity.sliceSpritesheetRow(base, BOMBER_ROW_UP, frameCount, size),
      left: Entity.sliceSpritesheetRow(base, BOMBER_ROW_RIGHT, frameCount, size),
    };
  }

  static async loadTextures(idleSrc: string, walkSrc: string, runSrc: string): Promise<WalkTextureSet | null> {
    try {
      const [idleBase, walkBase, runBase] = await Promise.all([
        Assets.load<Texture>(idleSrc),
        Assets.load<Texture>(walkSrc),
        Assets.load<Texture>(runSrc),
      ]);
      idleBase.source.scaleMode = 'nearest';
      walkBase.source.scaleMode = 'nearest';
      runBase.source.scaleMode = 'nearest';

      const walk = Bomber.sliceDirectionalSheet(walkBase, BOMBER_FRAME_COUNTS.walk);
      const idle = Bomber.sliceDirectionalSheet(idleBase, BOMBER_FRAME_COUNTS.idle);
      const run = Bomber.sliceDirectionalSheet(runBase, BOMBER_FRAME_COUNTS.run);

      return {
        ...walk,
        idleLeft: idle.left,
        idleDown: idle.down,
        idleUp: idle.up,
        runLeft: run.left,
        runDown: run.down,
        runUp: run.up,
      };
    } catch {
      return null;
    }
  }
}
