import { Assets, Cache, Texture } from 'pixi.js';
import {
  avatarSheetBlockIndex,
  PLAYER_IDLE_BLOCK_WIDTH,
  PLAYER_IDLE_SHEET_SRC,
  PLAYER_WALK_BLOCK_WIDTH,
  PLAYER_WALK_SHEET_SRC,
} from '../config/avatars.ts';
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

  private static async loadSheetTexture(src: string): Promise<Texture> {
    if (Cache.has(src)) {
      return Cache.get<Texture>(src);
    }
    const texture = await Assets.load<Texture>(src);
    texture.source.scaleMode = 'nearest';
    return texture;
  }

  /** Load packed idle + walk sheets once, then slice textures for each avatar block. */
  static async loadAllCharacterTextures(
    avatarIds: readonly string[],
    idleSrc: string = PLAYER_IDLE_SHEET_SRC,
    walkSrc: string = PLAYER_WALK_SHEET_SRC,
  ): Promise<Map<string, CharacterTextureSet>> {
    try {
      const [idleBase, walkBase] = await Promise.all([
        Player.loadSheetTexture(idleSrc),
        Player.loadSheetTexture(walkSrc),
      ]);

      const texturesByAvatarId = new Map<string, CharacterTextureSet>();
      for (const avatarId of avatarIds) {
        texturesByAvatarId.set(avatarId, Player.sliceCharacterTextures(idleBase, walkBase, avatarId));
      }
      return texturesByAvatarId;
    } catch {
      return new Map();
    }
  }

  private static sliceCharacterTextures(idleBase: Texture, walkBase: Texture, avatarId: string): CharacterTextureSet {
    const blockIndex = avatarSheetBlockIndex(avatarId);
    const idleOffset = blockIndex * PLAYER_IDLE_BLOCK_WIDTH;
    const walkOffset = blockIndex * PLAYER_WALK_BLOCK_WIDTH;

    return {
      idle: {
        front: Entity.sliceSpritesheetRow(
          idleBase,
          SHEET_ROW_BY_DIR.front,
          IDLE_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          idleOffset,
        ),
        back: Entity.sliceSpritesheetRow(
          idleBase,
          SHEET_ROW_BY_DIR.back,
          IDLE_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          idleOffset,
        ),
        right: Entity.sliceSpritesheetRow(
          idleBase,
          SHEET_ROW_BY_DIR.right,
          IDLE_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          idleOffset,
        ),
        left: Entity.sliceSpritesheetRow(
          idleBase,
          SHEET_ROW_BY_DIR.left,
          IDLE_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          idleOffset,
        ),
      },
      walk: {
        front: Entity.sliceSpritesheetRow(
          walkBase,
          SHEET_ROW_BY_DIR.front,
          WALK_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          walkOffset,
        ),
        back: Entity.sliceSpritesheetRow(
          walkBase,
          SHEET_ROW_BY_DIR.back,
          WALK_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          walkOffset,
        ),
        right: Entity.sliceSpritesheetRow(
          walkBase,
          SHEET_ROW_BY_DIR.right,
          WALK_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          walkOffset,
        ),
        left: Entity.sliceSpritesheetRow(
          walkBase,
          SHEET_ROW_BY_DIR.left,
          WALK_FRAMES_PER_ROW,
          CHARACTER_FRAME_SIZE,
          undefined,
          walkOffset,
        ),
      },
    };
  }

  /** Snap to idle facing (default: toward camera). Used on room enter/switch. */
  resetToIdle(direction: CharacterDirection = 'front'): void {
    this.direction = direction;
    this.state = 'idle';
    this.frameIndex = 0;
    this.frameTimerMs = 0;
    this.applyFrame();
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
