import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { HopEntity, type HopEntityConfig, type HopTextureSet } from './HopEntity.ts';

const FROG_BLUE_FRAME_SIZE = 16;
const FROG_BLUE_JUMP_FRAMES_PER_ROW = 8;
const FROG_BLUE_IDLE_FRAMES_PER_ROW = 4;
const FROG_BLUE_ROW_JUMP_DOWN = 0;
const FROG_BLUE_ROW_JUMP_RIGHT = 1;
const FROG_BLUE_ROW_JUMP_UP = 2;
const FROG_BLUE_ROW_IDLE_DOWN = 3;
const FROG_BLUE_ROW_IDLE_RIGHT = 4;

const FROG_BLUE_CONFIG: HopEntityConfig = {
  hopFps: 11,
  idleFps: 4,
  jumpFrameCount: FROG_BLUE_JUMP_FRAMES_PER_ROW,
  moveFrameCount: 6,
  moveStartFrame: 2,
  hopDistancePx: 16,
  horizontalProfileFacesRight: true,
  spriteFrameSizePx: FROG_BLUE_FRAME_SIZE,
};

export class FrogBlue extends HopEntity {
  readonly type = 'frogBlue' as const;

  constructor(
    textures: HopTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    roomId: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, roomId, FROG_BLUE_CONFIG);
  }

  static async loadTextures(src: string): Promise<HopTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        down: Entity.sliceSpritesheetRow(
          base,
          FROG_BLUE_ROW_JUMP_DOWN,
          FROG_BLUE_JUMP_FRAMES_PER_ROW,
          FROG_BLUE_FRAME_SIZE,
        ),
        left: Entity.sliceSpritesheetRow(
          base,
          FROG_BLUE_ROW_JUMP_RIGHT,
          FROG_BLUE_JUMP_FRAMES_PER_ROW,
          FROG_BLUE_FRAME_SIZE,
        ),
        up: Entity.sliceSpritesheetRow(
          base,
          FROG_BLUE_ROW_JUMP_UP,
          FROG_BLUE_JUMP_FRAMES_PER_ROW,
          FROG_BLUE_FRAME_SIZE,
        ),
        idleDown: Entity.sliceSpritesheetRow(
          base,
          FROG_BLUE_ROW_IDLE_DOWN,
          FROG_BLUE_IDLE_FRAMES_PER_ROW,
          FROG_BLUE_FRAME_SIZE,
        ),
        idleLeft: Entity.sliceSpritesheetRow(
          base,
          FROG_BLUE_ROW_IDLE_RIGHT,
          FROG_BLUE_IDLE_FRAMES_PER_ROW,
          FROG_BLUE_FRAME_SIZE,
        ),
      };
    } catch {
      return null;
    }
  }
}
