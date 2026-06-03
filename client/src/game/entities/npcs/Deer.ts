import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../Entity.ts';
import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

const FRAMES_PER_ROW = 4;
const IDLE_FRAMES_PER_ROW = 2;
const SHEET_ROW_LEFT = 0;
const SHEET_ROW_DOWN = 1;
const SHEET_ROW_UP = 2;
const DEER_IDLE_FPS = 3;

export class Deer extends WalkEntity {
  readonly type = 'deer' as const;

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
    return DEER_IDLE_FPS;
  }

  protected override get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }

  static async loadTextures(idleSrc: string, walkSrc: string): Promise<WalkTextureSet | null> {
    try {
      const [idleBase, walkBase] = await Promise.all([Assets.load<Texture>(idleSrc), Assets.load<Texture>(walkSrc)]);
      idleBase.source.scaleMode = 'nearest';
      walkBase.source.scaleMode = 'nearest';
      return {
        left: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_LEFT, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        down: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_DOWN, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        up: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_UP, FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        idleLeft: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_LEFT, IDLE_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        idleDown: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_DOWN, IDLE_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
        idleUp: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_UP, IDLE_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      };
    } catch {
      return null;
    }
  }
}
