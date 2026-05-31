import { Assets, Texture } from 'pixi.js';
import { Entity } from './Entity.ts';

export type CharacterDirection = 'front' | 'back' | 'left' | 'right';

export type CharacterTextureSet = {
  idle: Record<CharacterDirection, Texture[]>;
  walk: Record<CharacterDirection, Texture[]>;
};

const CHARACTER_FRAME_SIZE = 32;
const IDLE_FRAMES_PER_ROW = 4;
const WALK_FRAMES_PER_ROW = 6;
const IDLE_FPS = 4;
const WALK_FPS = 9;
const MOTION_THRESHOLD_PX_S = 6;
const DIAGONAL_AXIS_BLEND_MIN = 0.72;

const SHEET_ROW_BY_DIR: Record<CharacterDirection, number> = {
  front: 0,
  back: 1,
  right: 2,
  left: 2,
};

type AvatarState = 'idle' | 'walk';

/**
 * Per-player animated sprite. Direction is updated from world velocity; last facing is
 * preserved while idle. Parented into a player root offset by `-pad` on each axis.
 */
export class Player extends Entity {
  private readonly textures: CharacterTextureSet;
  private direction: CharacterDirection;
  private state: AvatarState = 'idle';
  private frameIndex = 0;
  private frameTimerMs = 0;

  constructor(textures: CharacterTextureSet, tileSize: number, initialDirection: CharacterDirection = 'front') {
    const { innerSize } = Entity.layoutForTileSize(tileSize);
    super(tileSize, textures.idle[initialDirection][0], innerSize / 2, innerSize / 2);
    this.textures = textures;
    this.direction = initialDirection;
    this.applyFrame();
  }

  /** Load both spritesheets; returns `null` if either asset fails. */
  static async loadTextures(idleSrc: string, walkSrc: string): Promise<CharacterTextureSet | null> {
    try {
      const [idleBase, walkBase] = await Promise.all([Assets.load<Texture>(idleSrc), Assets.load<Texture>(walkSrc)]);
      idleBase.source.scaleMode = 'nearest';
      walkBase.source.scaleMode = 'nearest';

      return {
        idle: {
          front: Entity.sliceSpritesheetRow(
            idleBase,
            SHEET_ROW_BY_DIR.front,
            IDLE_FRAMES_PER_ROW,
            CHARACTER_FRAME_SIZE,
          ),
          back: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_BY_DIR.back, IDLE_FRAMES_PER_ROW, CHARACTER_FRAME_SIZE),
          right: Entity.sliceSpritesheetRow(
            idleBase,
            SHEET_ROW_BY_DIR.right,
            IDLE_FRAMES_PER_ROW,
            CHARACTER_FRAME_SIZE,
          ),
          left: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_BY_DIR.left, IDLE_FRAMES_PER_ROW, CHARACTER_FRAME_SIZE),
        },
        walk: {
          front: Entity.sliceSpritesheetRow(
            walkBase,
            SHEET_ROW_BY_DIR.front,
            WALK_FRAMES_PER_ROW,
            CHARACTER_FRAME_SIZE,
          ),
          back: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_BY_DIR.back, WALK_FRAMES_PER_ROW, CHARACTER_FRAME_SIZE),
          right: Entity.sliceSpritesheetRow(
            walkBase,
            SHEET_ROW_BY_DIR.right,
            WALK_FRAMES_PER_ROW,
            CHARACTER_FRAME_SIZE,
          ),
          left: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_BY_DIR.left, WALK_FRAMES_PER_ROW, CHARACTER_FRAME_SIZE),
        },
      };
    } catch {
      return null;
    }
  }

  update(dtMs: number, vx: number, vy: number): void {
    const speed = Math.hypot(vx, vy);
    const moving = speed > MOTION_THRESHOLD_PX_S;

    if (moving) {
      const ax = Math.abs(vx);
      const ay = Math.abs(vy);
      const maxAxis = Math.max(ax, ay);
      const minAxis = Math.min(ax, ay);
      const blendedAxes = maxAxis > 1e-6 && minAxis / maxAxis >= DIAGONAL_AXIS_BLEND_MIN;

      if (blendedAxes) {
        this.direction = vx >= 0 ? 'right' : 'left';
      } else if (ax >= ay) {
        this.direction = vx >= 0 ? 'right' : 'left';
      } else {
        this.direction = vy >= 0 ? 'front' : 'back';
      }
    }

    const nextState: AvatarState = moving ? 'walk' : 'idle';
    if (nextState !== this.state) {
      this.state = nextState;
      this.frameIndex = 0;
      this.frameTimerMs = 0;
    }

    const fps = this.state === 'walk' ? WALK_FPS : IDLE_FPS;
    const msPerFrame = 1000 / fps;
    this.frameTimerMs += dtMs;
    while (this.frameTimerMs >= msPerFrame) {
      this.frameTimerMs -= msPerFrame;
      this.frameIndex += 1;
    }

    this.applyFrame();
  }

  private applyFrame(): void {
    const frames = this.state === 'walk' ? this.textures.walk[this.direction] : this.textures.idle[this.direction];
    this.setSpriteTexture(frames[this.wrapFrameIndex(this.frameIndex, frames.length)]);
    this.setSpriteFlipX(this.direction === 'left');
  }
}
