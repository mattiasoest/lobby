import { Animal, ANIMAL_SPRITE_SIZE_PX, type AnimalTextureSet } from './Animal.ts';

export class Cow extends Animal {
  readonly kind = 'cow' as const;

  constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, ANIMAL_SPRITE_SIZE_PX);
  }
}
