import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WalkEntity, type WalkTextureSet } from './WalkEntity.ts';

export const PENGUIN_SPRITE_SIZE_PX = 16;

const FRAMES_PER_ROW = 4;
const ROW_DOWN = 0;
const ROW_RIGHT = 1;
const ROW_UP = 2;
/** Trim bleed from adjacent rows (sprites sit low/high within 16px cells). */
const ROW_INSET = {
  down: { left: 3 },
  right: { top: 1 },
  up: { top: 1, left: 1 },
} as const;

export class Penguin extends WalkEntity {
  readonly type = 'penguin' as const;

  protected override get horizontalProfileFacesRight(): boolean {
    return true;
  }

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
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, PENGUIN_SPRITE_SIZE_PX, roomId);
  }

  static async loadTextures(src: string): Promise<WalkTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        down: Entity.sliceSpritesheetRow(base, ROW_DOWN, FRAMES_PER_ROW, PENGUIN_SPRITE_SIZE_PX, ROW_INSET.down),
        left: Entity.sliceSpritesheetRow(base, ROW_RIGHT, FRAMES_PER_ROW, PENGUIN_SPRITE_SIZE_PX, ROW_INSET.right),
        up: Entity.sliceSpritesheetRow(base, ROW_UP, FRAMES_PER_ROW, PENGUIN_SPRITE_SIZE_PX, ROW_INSET.up),
      };
    } catch {
      return null;
    }
  }
}
