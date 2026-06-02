import { Animal, PENGUIN_SPRITE_SIZE_PX, type AnimalTextureSet } from './Animal.ts';

export class Penguin extends Animal {
  readonly kind = 'penguin' as const;

  protected override get horizontalProfileFacesRight(): boolean {
    return true;
  }

  constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, PENGUIN_SPRITE_SIZE_PX);
  }
}
