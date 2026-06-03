import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

const FRAMES_PER_ROW = 4;
const SHEET_ROW_LEFT = 0;
const SHEET_ROW_DOWN = 1;
const SHEET_ROW_UP = 2;
/** Down/up rows sit high in their cells; trim bleed from the row above. */
const ROW_INSET = {
  down: { top: 1 },
  up: { top: 1 },
} as const;

export class Bull extends WalkEntity {
  readonly type = 'bull' as const;

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

  static async loadTextures(src: string): Promise<WalkTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        left: Entity.sliceSpritesheetRow(base, SHEET_ROW_LEFT, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        down: Entity.sliceSpritesheetRow(
          base,
          SHEET_ROW_DOWN,
          FRAMES_PER_ROW,
          WALK_ENTITY_SPRITE_SIZE_PX,
          ROW_INSET.down,
        ),
        up: Entity.sliceSpritesheetRow(base, SHEET_ROW_UP, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX, ROW_INSET.up),
      };
    } catch {
      return null;
    }
  }
}
