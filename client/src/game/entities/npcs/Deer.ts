import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';
import { loadIdleAndWalkSheets } from '../../core/npc/npcTextures.ts';

const DEER_IDLE_FPS = 3;
const DEER_IDLE_FRAMES_PER_ROW = 2;

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

  static async loadTextures(idleSrc: string, walkSrc: string): Promise<WalkTextureSet | null> {
    return loadIdleAndWalkSheets(idleSrc, walkSrc, DEER_IDLE_FRAMES_PER_ROW);
  }
}
