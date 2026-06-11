import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WalkEntity, type WalkTextureSet } from './WalkEntity.ts';

export const PENGUIN_MINI_SPRITE_SIZE_PX = 16;

const FRAMES_PER_ROW = 4;
const ROW_DOWN = 0;
const ROW_LEFT = 1;
const ROW_UP = 2;

export class PenguinMini extends WalkEntity {
  readonly type = 'penguinMini' as const;

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
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, PENGUIN_MINI_SPRITE_SIZE_PX, roomId);
  }

  static async loadTextures(src: string): Promise<WalkTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        down: Entity.sliceSpritesheetRow(base, ROW_DOWN, FRAMES_PER_ROW, PENGUIN_MINI_SPRITE_SIZE_PX),
        left: Entity.sliceSpritesheetRow(base, ROW_LEFT, FRAMES_PER_ROW, PENGUIN_MINI_SPRITE_SIZE_PX),
        up: Entity.sliceSpritesheetRow(base, ROW_UP, FRAMES_PER_ROW, PENGUIN_MINI_SPRITE_SIZE_PX),
      };
    } catch {
      return null;
    }
  }
}
