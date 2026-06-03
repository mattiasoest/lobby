import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

const DEER_IDLE_FPS = 3;

export class Deer extends WalkEntity {
  readonly kind = 'deer' as const;

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
}
