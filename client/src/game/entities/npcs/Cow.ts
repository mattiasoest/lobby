import { WalkEntity, WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

export class Cow extends WalkEntity {
  readonly kind = 'cow' as const;

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
}
