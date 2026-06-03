import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

const SLIME_IDLE_FPS = 5;
const SLIME_WALK_FPS = 7;
const SLIME_WALK_FRAME_COUNT = 4;

export class Slime extends WalkEntity {
  readonly kind = 'slime' as const;

  private finishingWalk = false;
  private walkFinishStartMs = 0;
  private walkFinishFromFrame = 0;
  private wasMoving = false;

  constructor(
    textures: WalkTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    roomId: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, WALK_ENTITY_SPRITE_SIZE_PX, roomId);
  }

  protected override get walkFps(): number {
    return SLIME_WALK_FPS;
  }

  protected override get idleFps(): number | null {
    return SLIME_IDLE_FPS;
  }

  protected override get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }

  protected override shouldUseIdleTextures(): boolean {
    return !this.isMoving && !this.finishingWalk && this.useIdleTextures;
  }

  protected override computeWalkFrameIndex(roomNowMs: number, moving: boolean): number {
    const lastFrame = SLIME_WALK_FRAME_COUNT - 1;

    if (moving) {
      this.finishingWalk = false;
      this.wasMoving = true;
      return Math.floor((roomNowMs / 1000) * this.walkFps);
    }

    if (this.wasMoving) {
      this.wasMoving = false;
      const atStop = Math.floor((roomNowMs / 1000) * this.walkFps) % SLIME_WALK_FRAME_COUNT;
      if (atStop >= lastFrame) {
        this.finishingWalk = false;
        return lastFrame;
      }
      this.finishingWalk = true;
      this.walkFinishStartMs = roomNowMs;
      this.walkFinishFromFrame = atStop;
      return atStop;
    }

    if (this.finishingWalk) {
      const advanced =
        this.walkFinishFromFrame + Math.floor(((roomNowMs - this.walkFinishStartMs) / 1000) * this.walkFps);
      if (advanced >= lastFrame) {
        this.finishingWalk = false;
        return lastFrame;
      }
      return advanced;
    }

    return 0;
  }
}
