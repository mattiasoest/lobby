import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

const FRAMES_PER_ROW = 4;
const ROW_WALK_LEFT = 0;
const ROW_WALK_DOWN = 1;
const ROW_WALK_UP = 2;
const ROW_IDLE_LEFT = 3;
const ROW_IDLE_DOWN = 4;
/** Down/up rows sit high in their cells; trim bleed from the row above. */
const ROW_INSET = {
  down: { top: 1 },
  up: { top: 1 },
} as const;
const HIGHLAND_BULL_IDLE_FPS = 3;

export class HighlandBull extends WalkEntity {
  readonly type = 'highlandBull' as const;

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

  protected override get idleFps(): number | null {
    return HIGHLAND_BULL_IDLE_FPS;
  }

  protected override get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }

  static async loadTextures(src: string): Promise<WalkTextureSet | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return {
        left: Entity.sliceSpritesheetRow(base, ROW_WALK_LEFT, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        down: Entity.sliceSpritesheetRow(
          base,
          ROW_WALK_DOWN,
          FRAMES_PER_ROW,
          WALK_ENTITY_SPRITE_SIZE_PX,
          ROW_INSET.down,
        ),
        up: Entity.sliceSpritesheetRow(base, ROW_WALK_UP, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX, ROW_INSET.up),
        idleLeft: Entity.sliceSpritesheetRow(base, ROW_IDLE_LEFT, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        idleDown: Entity.sliceSpritesheetRow(base, ROW_IDLE_DOWN, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      };
    } catch {
      return null;
    }
  }
}
