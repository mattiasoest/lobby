import { WalkEntity, PENGUIN_SPRITE_SIZE_PX, type WalkTextureSet } from './WalkEntity.ts';

export class Penguin extends WalkEntity {
  readonly kind = 'penguin' as const;

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
}
